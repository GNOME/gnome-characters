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
const CategoryList = imports.categoryList;
const Character = imports.character;
const CharacterList = imports.characterList;
const Menu = imports.menu;
const Gettext = imports.gettext;

const Main = imports.main;
const Util = imports.util;

const MainWindow = new Lang.Class({
    Name: 'MainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///org/gnome/Characters/mainwindow.ui',
    InternalChildren: ['main-headerbar', 'search-active-button',
                       'search-bar', 'search-entry',
                       'menu-button',
                       'main-grid', 'main-hbox', 'sidebar-grid'],
    Properties: {
        'search-active': GObject.ParamSpec.boolean(
            'search-active', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE, false)
    },

    _init: function(params) {
        params = Params.fill(params, { title: GLib.get_application_name(),
                                       default_width: 640,
                                       default_height: 480 });
        this.parent(params);

        this._searchActive = false;
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
                            state: new GLib.Variant('s', 'punctuation') },
                          { name: 'character',
                            activate: this._character,
                            parameter_type: new GLib.VariantType('s') },
                          { name: 'filter-font',
                            activate: this._filterFont,
                            parameter_type: new GLib.VariantType('s') }]);

        this.bind_property('search-active', this._search_active_button, 'active',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        this.bind_property('search-active',
                           this._search_bar,
                           'search-mode-enabled',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        this._search_bar.connect_entry(this._search_entry);
        this._search_entry.connect('search-changed',
                                   Lang.bind(this, this._handleSearchChanged));

        this._menu_popover = new Menu.MenuPopover({});
        this._menu_button.set_popover(this._menu_popover);

        this._categoryList =
            new CategoryList.CategoryListWidget({ vexpand: true });
        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            hexpand: false,
        });
        scroll.add(this._categoryList);
        this._sidebar_grid.add(scroll);

        this._mainView = new MainView({ categoryList: this._categoryList });

        if (this._mainView.recentCharacters.length == 0) {
            let row = this._categoryList.get_row_at_index(1);
            this._categoryList.select_row(row);
        }

        this._main_hbox.pack_start(this._mainView, true, true, 0);
        this._main_grid.show_all();

        // Due to limitations of gobject-introspection wrt GdkEvent
        // and GdkEventKey, this needs to be a signal handler
        this.connect('key-press-event', Lang.bind(this, this._handleKeyPress));
    },

    get search_active() {
        return this._searchActive;
    },

    set search_active(v) {
        if (this._searchActive == v)
            return;

        this._searchActive = v;

        if (this._searchActive)
            this._categoryList.unselect_all();

        this.notify('search-active');
    },

    _handleSearchChanged: function(entry) {
        let text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text == '' ? [] : text.split(/\s+/);
        keywords = keywords.map(String.toUpperCase);
        if (keywords != this._searchKeywords) {
            this._searchKeywords = keywords;
            if (this._searchKeywords.length > 0)
                this._mainView.searchByKeywords(this._searchKeywords);
            else
                this._mainView.cancelSearch();
        }
        return true;
    },

    _handleKeyPress: function(self, event) {
        if (this._menu_popover.visible)
            return false;
        return this._search_bar.handle_event(event);
    },

    _about: function() {
        let aboutDialog = new Gtk.AboutDialog(
            { artists: [ 'Allan Day <allanpday@gmail.com>',
                         'Jakub Steiner <jimmac@gmail.com>' ],
              authors: [ 'Daiki Ueno <dueno@src.gnome.org>',
                         'Giovanni Campagna <scampa.giovanni@gmail.com>' ],
              // TRANSLATORS: put your names here, one name per line.
              translator_credits: _("translator-credits"),
              program_name: _("GNOME Characters"),
              comments: _("Character Map"),
              copyright: 'Copyright 2014-2015 Daiki Ueno',
              license_type: Gtk.License.GPL_2_0,
              logo_icon_name: 'gnome-characters',
              version: pkg.version,
              // website: 'https://wiki.gnome.org/Design/Apps/CharacterMap',
              wrap_license: true,
              modal: true,
              transient_for: this
            });

        aboutDialog.show();
        aboutDialog.connect('response', function() {
            aboutDialog.destroy();
        });
    },

    _updateTitle: function(title) {
        if (this._mainView.filterFontFamily) {
            this._main_headerbar.title =
                _("%s (%s only)").format(Gettext.gettext(title),
                                         this._mainView.filterFontFamily);
        } else {
            this._main_headerbar.title = Gettext.gettext(title);
        }
    },

    _category: function(action, v) {
        this.search_active = false;

        let [name, length] = v.get_string()

        let category = this._categoryList.getCategory(name);

        Util.assertNotEqual(category, null);
        this._mainView.setPage(category);
        this._updateTitle(category.title);
    },

    _character: function(action, v) {
        let [uc, length] = v.get_string()
        this._mainView.addToRecent(uc);
    },

    _filterFont: function(action, v) {
        let [family, length] = v.get_string()
        if (family == 'None')
            family = null;
        this._mainView.filterFontFamily = family;
        this._updateTitle(this._mainView.visible_child.title);
    },

    setSearchKeywords: function(keywords) {
        this.search_active = keywords.length > 0;
        this._search_entry.set_text(keywords.join(' '));
    }
});

const MainView = new Lang.Class({
    Name: 'MainView',
    Extends: Gtk.Stack,
    Properties: {
        'max-recent-characters': GObject.ParamSpec.uint(
            'max-recent-characters', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            0, GLib.MAXUINT32, 100)
    },

    get max_recent_characters() {
        return this._maxRecentCharacters;
    },

    set max_recent_characters(v) {
        this._maxRecentCharacters = v;
        if (this.recentCharacters.length > this._maxRecentCharacters)
            this.recentCharacters = this.recentCharacters.slice(
                0, this._maxRecentCharacters);
    },

    get filterFontFamily() {
        return this._filterFontFamily;
    },

    set filterFontFamily(family) {
        this._filterFontFamily = family;
        this.visible_child.setFilterFont(family);
    },

    _init: function(params) {
        let filtered = Params.filter(params, { categoryList: null });
        params = Params.fill(params, {
            hexpand: true, vexpand: true,
            transition_type: Gtk.StackTransitionType.CROSSFADE
        });
        this.parent(params);

        this._filterFontFamily = null;
        this._characterLists = {};
        this._categoryList = filtered.categoryList;

        let characterList;
        let categories = this._categoryList.getCategoryList();
        for (let index in categories) {
            let category = categories[index];
            characterList = this._createCharacterList(
                category.name, _('%s Character List').format(category.title));
            // FIXME: Can't use GtkContainer.child_get_property.
            characterList.title = category.title;
            this.add_titled(characterList, category.name, category.title);
        }

        characterList = this._createCharacterList(
            'search-result', _('Search Result Character List'));
        // FIXME: Can't use GtkContainer.child_get_property.
        characterList.title = "Search Result";
        this.add_named(characterList, 'search-result');

        // FIXME: Can't use GSettings.bind with 'as' from Gjs
        let recentCharacters = Main.settings.get_value('recent-characters');
        this.recentCharacters = recentCharacters.get_strv();
        this._maxRecentCharacters = 100;
        Main.settings.bind('max-recent-characters', this,
                           'max-recent-characters',
                           Gio.SettingsBindFlags.DEFAULT);
    },

    _createCharacterList: function(name, accessible_name) {
        let characterList = new CharacterList.CharacterListView({});
        characterList.get_accessible().accessible_name = accessible_name;

        let scroll = characterList.get_child_by_name('character-list');
        let widget = scroll.get_child().get_child();
        widget.connect('character-selected',
                       Lang.bind(this, this._handleCharacterSelected));

        this._characterLists[name] = characterList;
        return characterList;
    },

    searchByKeywords: function(keywords) {
        this.visible_child_name = 'search-result';
        this.visible_child.searchByKeywords(keywords);
    },

    cancelSearch: function() {
        this.visible_child.cancelSearch();
    },

    setPage: function(category) {
        let characterList = this.get_child_by_name(category.name);
        characterList.setFilterFont(this._filterFontFamily);

        if (category.name == 'recent') {
            if (this.recentCharacters.length == 0)
                characterList.visible_child_name = 'empty-recent';
            else {
                characterList.setCharacters(this.recentCharacters);
                characterList.updateCharacterList();
            }
        } else {
            characterList.searchByCategory(category);
        }

        this.visible_child = characterList;
    },

    addToRecent: function(uc) {
        if (this.recentCharacters.indexOf(uc) < 0) {
            this.recentCharacters.unshift(uc);
            if (this.recentCharacters.length > this._maxRecentCharacters)
                this.recentCharacters = this.recentCharacters.slice(
                    0, this._maxRecentCharacters);
            Main.settings.set_value(
                'recent-characters',
                GLib.Variant.new_strv(this.recentCharacters));
        }
    },

    _handleCharacterSelected: function(widget, uc) {
        this.addToRecent(uc);

        let dialog = new Character.CharacterDialog({
            character: uc,
            modal: true,
            transient_for: this.get_toplevel(),
            fontDescription: this.visible_child.getFontDescription()
        });

        dialog.show();
        dialog.connect('response', function(self, response_id) {
            if (response_id == Gtk.ResponseType.CLOSE)
                dialog.destroy();
        });
    }
});
