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

const {Gio, GLib, GObject, Gtk, Handy } = imports.gi;

const Params = imports.params;
const CategoryList = imports.categoryList;
const Character = imports.characterDialog;
const CharacterList = imports.characterList;
const Menu = imports.menu;
const Gettext = imports.gettext;

const Main = imports.main;
const Util = imports.util;

var MainWindow = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/mainwindow.ui',
    InternalChildren: [
        'main-headerbar', 'search-active-button',
        'search-bar', 'search-entry', 'back-button',
        'menu-button', 'container', 'sidebar',
        'leaflet'
    ],
    Properties: {
        'search-active': GObject.ParamSpec.boolean(
            'search-active', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE, false)
    },
}, class MainWindow extends Handy.ApplicationWindow {
    _init(params) {
        params = Params.fill(params, { title: GLib.get_application_name() });
        super._init(params);

        this._searchActive = false;
        this._searchKeywords = [];

        Util.initActions(this,
                         [{ name: 'about',
                            activate: this._about },
                          { name: 'search-active',
                            activate: this._toggleSearch,
                            parameter_type: new GLib.VariantType('b'),
                            state: new GLib.Variant('b', false) },
                          { name: 'find',
                            activate: this._find },
                          { name: 'category',
                            activate: this._category,
                            parameter_type: new GLib.VariantType('s'),
                            state: new GLib.Variant('s', 'emoji-smileys') },
                          { name: 'character',
                            activate: this._character,
                            parameter_type: new GLib.VariantType('s') },
                          { name: 'filter-font',
                            activate: this._filterFont,
                            parameter_type: new GLib.VariantType('s') }]);

        this.application.set_accels_for_action('win.find', ['<Primary>F']);

        this.bind_property('search-active', this._search_active_button, 'active',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        this.bind_property('search-active',
                           this._search_bar,
                           'search-mode-enabled',
                           GObject.BindingFlags.SYNC_CREATE |
                           GObject.BindingFlags.BIDIRECTIONAL);
        this._search_bar.connect_entry(this._search_entry);
        this._search_entry.connect('search-changed', (entry) => this._handleSearchChanged(entry));

        this._back_button.connect('clicked', () => {
            this._leaflet.navigate(Handy.NavigationDirection.BACK);
        });

        this._menu_popover = new Menu.MenuPopover({});
        this._menu_button.set_popover(this._menu_popover);

        this._categoryListView =
            new CategoryList.CategoryListView({ vexpand: true });
        this._categoryListView.show_all();
        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            hexpand: false,
            visible: true,
        });
        scroll.add(this._categoryListView);
        this._sidebar.add(scroll);

        this._mainView = new MainView({
            categoryListView: this._categoryListView
        });

        this._container.pack_start(this._mainView, true, true, 0);

        // Due to limitations of gobject-introspection wrt GdkEvent
        // and GdkEventKey, this needs to be a signal handler
        this.connect('key-press-event', (self, event) => this._handleKeyPress(self, event));
    }

    vfunc_map() {
        super.vfunc_map();
        this._selectFirstSubcategory();
    }

    // Select the first subcategory which contains at least one character.
    _selectFirstSubcategory() {
        let categoryList;
        if (this._mainView.recentCharacters.length !== 0) {
            categoryList = this._categoryListView.getCategoryByName('recent');
        } else {
            categoryList = this._categoryListView.getCategoryByName('emojis');
        }
        categoryList.select_row(categoryList.get_row_at_index(0));
    }

    get search_active() {
        return this._searchActive;
    }

    set search_active(v) {
        if (this._searchActive == v)
            return;

        this._searchActive = v;

        if (this._searchActive) {
            let categoryList = this._categoryListView.selectedList;
            categoryList.unselect_all();
            this._updateTitle(_("Search Result"));
        } else {
            this._categoryListView.restorePreviousSelection();
        }

        this.notify('search-active');
    }

    _handleSearchChanged(entry) {
        const text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text == '' ? [] : text.split(/\s+/);
        keywords = keywords.map(x => x.toUpperCase());
        if (keywords != this._searchKeywords) {
            this._mainView.cancelSearch();
            this._searchKeywords = keywords;
            if (this._searchKeywords.length > 0)
                this._mainView.searchByKeywords(this._searchKeywords);
        }
        return true;
    }

    _handleKeyPress(self, event) {
        if (this._menu_popover.visible)
            return false;
        return this._search_bar.handle_event(event);
    }

    _about() {
        const aboutDialog = new Gtk.AboutDialog(
            { artists: [ 'Allan Day <allanpday@gmail.com>',
                         'Jakub Steiner <jimmac@gmail.com>' ],
              authors: [ 'Daiki Ueno <dueno@src.gnome.org>',
                         'Giovanni Campagna <scampa.giovanni@gmail.com>' ],
              // TRANSLATORS: put your names here, one name per line.
              translator_credits: _("translator-credits"),
              program_name: _("GNOME Characters"),
              comments: _("Character Map"),
              copyright: 'Copyright 2014-2018 Daiki Ueno',
              license_type: Gtk.License.GPL_2_0,
              logo_icon_name: Main.application_id,
              version: pkg.version,
              website: 'https://wiki.gnome.org/Apps/Characters',
              wrap_license: true,
              modal: true,
              transient_for: this
            });

        aboutDialog.show();
        aboutDialog.connect('response', function() {
            aboutDialog.destroy();
        });
    }

    _updateTitle(title) {
        if (this._mainView.filterFontFamily) {
            this._main_headerbar.title =
                _("%s (%s only)").format(Gettext.gettext(title),
                                         this._mainView.filterFontFamily);
        } else {
            this._main_headerbar.title = Gettext.gettext(title);
        }
    }

    _category(action, v) {
        this.search_active = false;

        let [name, length] = v.get_string();
        let categoryName;
        if(name.startsWith("emoji")) {
            categoryName = "emojis";
        } else if(name === "recent") {
            categoryName = "recent";
        } else {
            categoryName = "letters";
        } 
        let categoryList = this._categoryListView.getCategoryByName(categoryName);
        let category = categoryList.getCategory(name);
        if (category) {
            this._mainView.setPage(category);
            this._updateTitle(category.title);
            this._leaflet.navigate(Handy.NavigationDirection.FORWARD);
        }
    }

    _character(action, v) {
        const [uc, length] = v.get_string();
        this._mainView.addToRecent(uc);
    }

    _filterFont(action, v) {
        let [family, length] = v.get_string();
        if (family == 'None')
            family = null;
        this._mainView.filterFontFamily = family;
        this._updateTitle(this._mainView.visible_child.title);
        this._menu_popover.hide();
    }

    _find() {
        this.search_active = !this.search_active;
    }

    setSearchKeywords(keywords) {
        this.search_active = keywords.length > 0;
        this._search_entry.set_text(keywords.join(' '));
    }
});

const MainView = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/mainview.ui',
    Properties: {
        'max-recent-characters': GObject.ParamSpec.uint(
            'max-recent-characters', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            0, GLib.MAXUINT32, 100)
    },
}, class MainView extends Gtk.Stack {
    get max_recent_characters() {
        return this._maxRecentCharacters;
    }

    set max_recent_characters(v) {
        this._maxRecentCharacters = v;
        if (this.recentCharacters.length > this._maxRecentCharacters)
            this.recentCharacters = this.recentCharacters.slice(
                0, this._maxRecentCharacters);
    }

    get filterFontFamily() {
        return this._filterFontFamily;
    }

    set filterFontFamily(family) {
        this._filterFontFamily = family;
        this._fontFilter.setFilterFont(this._filterFontFamily);
    }

    _init(params) {
        const filtered = Params.filter(params, { categoryListView: null });
        params = Params.fill(params, {
            hexpand: true, vexpand: true,
            transition_type: Gtk.StackTransitionType.CROSSFADE
        });
        super._init(params);

        this._fontFilter = new CharacterList.FontFilter({});
        this._filterFontFamily = null;
        this._characterLists = {};
        this._recentCharacterLists = {};
        this._categoryListView = filtered.categoryListView;

        let characterList;
        let categories = this._categoryListView.getCategoryList();
        let recentBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL,
                                      hexpand: true, vexpand: false });

        for (let i in categories) {
            let category = categories[i];
            let categoryList = this._categoryListView.getCategoryByName(category.name);
            let subcategories = categoryList.getCategoryList();
            for (let j in subcategories) {
                let subcategory = subcategories[j];
                characterList = this._createCharacterList(
                    subcategory.name,
                    _('%s Character List').format(subcategory.title));
                // FIXME: Can't use GtkContainer.child_get_property.
                characterList.title = subcategory.title;
                this.add_titled(characterList, subcategory.name, subcategory.title);
            }
            characterList = this._createRecentCharacterList(
                category.name,
                // TRANSLATORS: %s will be either 'emojis' or 'letters'
                _('Recently Used %s Character List').format(category.title),
                category.category);
            this._recentCharacterLists[category.name] = characterList;
            if (i > 0) {
                let separator = new Gtk.Separator({});
                recentBox.pack_start(separator, false, false, 0);
            }
            recentBox.pack_start(characterList, false, false, 0);
        }
        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            hexpand: false,
        });
        scroll.add(recentBox);
        recentBox.show_all();
        scroll.show_all();
        // FIXME: Can't use GtkContainer.child_get_property.
        scroll.title = _('Recently Used');
        this.add_titled(scroll, 'recent', scroll.title);

        characterList = this._createCharacterList(
            'search-result', _('Search Result Character List'));
        // FIXME: Can't use GtkContainer.child_get_property.
        characterList.title = _("Search Result");
        this.add_named(characterList, 'search-result');

        // FIXME: Can't use GSettings.bind with 'as' from Gjs
        let recentCharacters = Main.settings.get_value('recent-characters');
        this.recentCharacters = recentCharacters.get_strv();
        this._maxRecentCharacters = 100;
        Main.settings.bind('max-recent-characters', this,
                           'max-recent-characters',
                           Gio.SettingsBindFlags.DEFAULT);
    }

    _createCharacterList(name, accessible_name) {
        const characterList = new CharacterList.CharacterListView({
            fontFilter: this._fontFilter,
        });
        characterList.get_accessible().accessible_name = accessible_name;
        characterList.connect('character-selected', (widget, uc) => this._handleCharacterSelected(widget, uc));

        this._characterLists[name] = characterList;
        return characterList;
    }

    _createRecentCharacterList(name, accessible_name, category) {
        const characterList = new CharacterList.RecentCharacterListView({
            fontFilter: this._fontFilter,
            category: category
        });
        characterList.get_accessible().accessible_name = accessible_name;
        characterList.connect('character-selected', (widget, uc) => this._handleCharacterSelected(widget, uc));

        this._characterLists[name] = characterList;
        return characterList;
    }

    searchByKeywords(keywords) {
        this.visible_child_name = 'search-result';
        this.visible_child.searchByKeywords(keywords);
    }

    cancelSearch() {
        const characterList = this.get_child_by_name('search-result');
        characterList.cancelSearch();
    }

    setPage(category) {
        if (category.name === 'recent') {
            if (this.recentCharacters.length === 0)
                this.visible_child_name = 'empty-recent';
            else {
                let categories = this._categoryListView.getCategoryList();
                for (let i in categories) {
                    let category = categories[i];
                    let characterList = this._recentCharacterLists[category.name];
                    characterList.setCharacters(this.recentCharacters);
                }
                this.visible_child_name = 'recent';
            }
        } else {
            let characterList = this.get_child_by_name(category.name);
            characterList.searchByCategory(category);
            this.visible_child = characterList;
        }
    }

    addToRecent(uc) {
        if (this.recentCharacters.indexOf(uc) < 0) {
            this.recentCharacters.unshift(uc);
            if (this.recentCharacters.length > this._maxRecentCharacters)
                this.recentCharacters = this.recentCharacters.slice(
                    0, this._maxRecentCharacters);
            Main.settings.set_value(
                'recent-characters',
                GLib.Variant.new_strv(this.recentCharacters));
        }
    }

    _addToRecent(widget, uc) {
        this.addToRecent(uc);
    }

    _handleCharacterSelected(widget, uc) {
        const dialog = new Character.CharacterDialog({
            character: uc,
            modal: true,
            transient_for: this.get_toplevel(),
            fontDescription: this._fontFilter.fontDescription
        });

        dialog.show();
        dialog.connect('character-copied', (widget, uc) => this._addToRecent(widget, uc));
        dialog.connect('response', function(self, response_id) {
            if (response_id == Gtk.ResponseType.CLOSE)
                dialog.destroy();
        });
    }
});
