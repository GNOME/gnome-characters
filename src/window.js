// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (c) 2013 Giovanni Campagna <scampa.giovanni@gmail.com>
//
// Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//   * Redistributions of source code must retain the above copyright
//     notice, this list of conditions and the following disclaimer.
//   * Redistributions in binary form must reproduce the above copyright
//     notice, this list of conditions and the following disclaimer in the
//     documentation and/or other materials provided with the distribution.
//   * Neither the name of the GNOME Foundation nor the
//     names of its contributors may be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;
const CharacterList = imports.characterList;
const CategoryList = imports.categoryList;
const Gc = imports.gi.Gc;
const Gettext = imports.gettext;

const Util = imports.util;

const MAX_SEARCH_RESULTS = 100;

const MainWindow = new Lang.Class({
    Name: 'MainWindow',
    Extends: Gtk.ApplicationWindow,
    Properties: { 'search-active': GObject.ParamSpec.boolean('search-active', '', '', GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE, false) },

    _init: function(params) {
        params = Params.fill(params, { title: GLib.get_application_name(),
                                       default_width: 640,
                                       default_height: 480 });
        this.parent(params);

        this._searchActive = false;
        this._searchCancellable = new Gio.Cancellable();
        this._searchKeywords = [];

        Util.initActions(this,
                         [{ name: 'about',
                            activate: this._about },
                          { name: 'search-active',
                            activate: this._toggleSearch,
                            parameter_type: new GLib.VariantType('b'),
                            state: new GLib.Variant('b', false) },
                          { name: 'category',
                            activate: this._category,
                            parameter_type: new GLib.VariantType('s'),
                            state: new GLib.Variant('s', 'punctuation') }]);

        let builder = new Gtk.Builder();
        builder.add_from_resource('/org/gnome/Characters/main.ui');
        builder.add_from_resource('/org/gnome/Characters/sidebar.ui');

        this._headerBar = builder.get_object('main-header');
        this.set_titlebar(this._headerBar);

        let searchBtn = builder.get_object('search-active-button');
        this.bind_property('search-active', searchBtn, 'active',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        this._searchBar = builder.get_object('search-bar');
        this.bind_property('search-active', this._searchBar, 'search-mode-enabled',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        let searchEntry = builder.get_object('search-entry');
        this._searchBar.connect_entry(searchEntry);
        searchEntry.connect('search-changed',
                            Lang.bind(this, this._handleSearchChanged));

        let grid = builder.get_object('main-grid');
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

        let sidebarGrid = builder.get_object('sidebar-grid');
        this._categoryList = new CategoryList.CategoryListWidget();
        sidebarGrid.add(this._categoryList);
        hbox.pack_start(sidebarGrid, false, false, 2);

        this._mainView = new MainView();
        hbox.pack_start(this._mainView, true, true, 0);

        grid.add(hbox);

        this.add(grid);
        grid.show_all();

        // Due to limitations of gobject-introspection wrt GdkEvent and GdkEventKey,
        // this needs to be a signal handler
        this.connect('key-press-event', Lang.bind(this, this._handleKeyPress));
    },

    get search_active() {
        return this._searchActive;
    },

    set search_active(v) {
        if (this._searchActive == v)
            return;

        this._searchActive = v;
        if (this._searchActive) {
            this._mainView.visible_child_name = 'search-prompt';
        } else {
            this._mainView.visible_child_name = 'punctuation';
        }
        this.notify('search-active');
    },

    _handleSearchChanged: function(entry) {
        let text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text == '' ? [] : text.split(/\s+/);
        if (keywords != this._searchKeywords) {
            this._searchCancellable.cancel();
            this._searchCancellable.reset();
            this._searchKeywords = keywords;
            if (this._searchKeywords.length > 0) {
                Gc.search_character(this._searchKeywords,
                                    MAX_SEARCH_RESULTS,
                                    this._searchCancellable,
                                    Lang.bind(this, this._searchReadyCallback));
            } else
                this._mainView.setSearchResult([]);
        }
        return true;
    },

    _handleKeyPress: function(self, event) {
        return this._searchBar.handle_event(event);
    },

    _searchReadyCallback: function(source_object, res, user_data) {
        let result = Gc.search_character_finish(res);
        let resultCharacters = [];
        for (let index = 0; index < result.len; index++) {
            resultCharacters.push(Gc.search_result_get(result, index));
        }
        this._mainView.setSearchResult(resultCharacters);
    },

    _about: function() {
        let aboutDialog = new Gtk.AboutDialog(
            { authors: [ 'Daiki Ueno <dueno@src.gnome.org>' ],
              translator_credits: _("translator-credits"),
              program_name: _("GNOME Characters"),
              comments: _("Character Map"),
              copyright: 'Copyright 2014 Daiki Ueno',
              license_type: Gtk.License.GPL_2_0,
              logo_icon_name: 'org.gnome.Characters',
              version: pkg.version,
              website: 'http://www.example.com/gtk-js-app/',
              wrap_license: true,
              modal: true,
              transient_for: this
            });

        aboutDialog.show();
        aboutDialog.connect('response', function() {
            aboutDialog.destroy();
        });
    },

    _category: function(action, v) {
        let [name, length] = v.get_string()
        this._mainView.visible_child_name = name;
        let category = null;
        for (let index in CategoryList.Category) {
            category = CategoryList.Category[index];
            if (category.name == name)
                break;
        }

        Util.assertNotEqual(category, null);
        this._headerBar.title = Gettext.gettext(category.label);
    },
});

const MainView = new Lang.Class({
    Name: 'MainView',
    Extends: Gtk.Stack,

    _init: function(params) {
        params = Params.fill(params, { hexpand: true,
                                       vexpand: true });
        this.parent(params);
        this._characterListWidgets = {};

        for (let index in CategoryList.Category) {
            let category = CategoryList.Category[index];
            let characterList = this._createCharacterList(category.category);
            this._characterListWidgets[category.name] = characterList;
            this.add_named(this._createScrolledWindow(characterList),
                           category.name);
        }

        this._searchResultCharacterList =
            this._createCharacterList(Gc.Category.NONE);
        this.add_named(
            this._createScrolledWindow(this._searchResultCharacterList),
            'search-result');

        let searchPromptGrid =
            new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                           halign: Gtk.Align.CENTER,
                           valign: Gtk.Align.CENTER });
        searchPromptGrid.get_style_context().add_class('search-prompt');
        let searchPromptIcon =
            new Gio.ThemedIcon({ name: 'edit-find-symbolic' });
        let searchPromptImage =
            Gtk.Image.new_from_gicon(searchPromptIcon, Gtk.IconSize.DIALOG);
        searchPromptGrid.add(searchPromptImage);
        let searchPromptLabel = new Gtk.Label({ label: _('Type to Search') });
        searchPromptLabel.get_style_context().add_class('search-prompt-label');
        searchPromptGrid.add(searchPromptLabel);
        this.add_named(searchPromptGrid, 'search-prompt');

        this.recentCharacters = [];
        this.connect('notify::visible-child-name',
                     Lang.bind(this, this._handleVisibleChildName));
    },

    _handleVisibleChildName: function() {
        let characterList = this._characterListWidgets[this.visible_child_name];
        if (this.visible_child_name == 'recent') {
            characterList.setCharacters(this.recentCharacters);
            characterList.show_all();
        } else if (characterList) {
            let category = null;
            for (let index in CategoryList.Category) {
                category = CategoryList.Category[index];
                if (category.name == this.visible_child_name)
                    break;
            }

            Util.assertNotEqual(category, null);
            let characters = []
            let iter = Gc.enumerate_character_by_category(category.category);
            while (iter.next ())
                characters.push(iter.get());
            characterList.setCharacters(characters);
            characterList.show_all();
        }
    },

    _createCharacterList: function(category) {
        let widget = new CharacterList.CharacterListWidget({ hexpand: true,
                                                             vexpand: true });
        widget.connect('character-selected',
                       Lang.bind(this, this._addToRecentCharacters));
        return widget;
    },

    _createScrolledWindow: function(widget) {
        let viewport = new Gtk.Viewport({});
        viewport.add(widget);

        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER
        });
        scroll.add(viewport);
        return scroll;
    },

    setSearchResult: function(result) {
        this._searchResultCharacterList.setCharacters(result);
        if (result.length == 0)
            this.visible_child_name = 'search-prompt';
        else {
            this.visible_child_name = 'search-result';
            this._searchResultCharacterList.show_all();
        }
    },

    _addToRecentCharacters: function(widget, uc) {
        if (this.recentCharacters.indexOf(uc) < 0)
            this.recentCharacters.push(uc);
    }
});
