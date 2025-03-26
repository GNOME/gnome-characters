/* exported MainWindow */
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

const { Adw, Gio, GLib, GObject, Gtk, Gc } = imports.gi;

const { CharacterDialog } = imports.characterDialog;
const Main = imports.main;
const Util = imports.util;

var MainWindow = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/window.ui',
    InternalChildren: [
        'searchButton', 'search-bar', 'searchEntry',
        'container', 'sidebar', 'splitView',
        'mainStack', 'contentChild', 'charactersView',
        'scrolledWindow', 'primaryMenuButton',
    ],
    Properties: {
        'max-recent-characters': GObject.ParamSpec.uint(
            'max-recent-characters', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            0, GLib.MAXUINT32, 100),
    },
}, class MainWindow extends Adw.ApplicationWindow {
    _init(application) {
        super._init({ application, title: GLib.get_application_name() });

        this._searchKeywords = [];
        this._characterLists = {};
        this._recentCharacterLists = {};

        this._charactersView.connect('character-selected', (widget, uc) => {
            this._handleCharacterSelected(widget, uc);
        });

        this._sidebar.connect('activated', () => {
            const adj = this._scrolledWindow.get_vadjustment();
            adj.set_value(0.0); // scroll back to the top
            this._charactersView.queue_resize();
            let item = this._sidebar.sidebar.selected_item;
            if (item) {
                this._sidebar.lastSelectedItem = item;
                this.setPage(item);
                this._contentChild.title = item.title;
                this._splitView.show_content = true;
            }
        });

        // FIXME: Can't use GSettings.bind with 'as' from Gjs
        let recentCharacters = Main.settings.get_value('recent-characters');
        this.recentCharacters = recentCharacters.deepUnpack();
        this._maxRecentCharacters = 100;
        Main.settings.bind('max-recent-characters', this,
            'max-recent-characters',
            Gio.SettingsBindFlags.DEFAULT);

        Util.initActions(this, [
            { name: 'about', activate: this._about },
            {
                name: 'find',
                activate: () => {
                    this._searchButton.active = !this._searchButton.active;
                },
            },
        ]);

        this._searchButton.bind_property('active',
            this._search_bar,
            'search-mode-enabled',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
        );

        this._searchButton.connect('toggled', btn => {
            if (btn.active)
                this._searchEntry.grab_focus();
            else
                this._searchEntry.set_text('');

            this.searchActive = btn.active;
        });

        this._searchEntry.connect('search-changed', entry => this._handleSearchChanged(entry));
        this._searchEntry.set_key_capture_widget(this);
        this._searchEntry.connect('search-started', () => {
            this.searchActive = true;
            this._searchButton.set_active(true);
        });
        this._searchEntry.connect('stop-search', () => {
            this.searchActive = false;
            this._searchButton.set_active(false);
        });

        this._charactersView.connect('notify::loading', view => {
            if (view.loading) {
                this._mainStack.visible_child_name = 'loading';
            } else {
                this._mainStack.visible_child_name = 'character-list';
                this._mainStack.queue_draw();
            }
        });
    }

    vfunc_map() {
        super.vfunc_map();
        // Select the first subcategory which contains at least one character.
        if (this.recentCharacters.length !== 0)
            this._sidebar.selectRowByName('recent');
        else
            this._sidebar.selectRowByName('smileys');
    }

    set searchActive(v) {
        if (v) {
            this._sidebar.unselectAll();
            this._contentChild.title = _('Search Result');
        } else {
            this._sidebar.restoreSelection();
        }
    }

    _handleSearchChanged(entry) {
        const text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text === '' ? [] : text.split(/\s+/);
        keywords = keywords.map(x => x.toUpperCase());
        if (keywords !== this._searchKeywords) {
            this._charactersView.cancelSearch();
            this._searchKeywords = keywords;
            if (this._searchKeywords.length > 0)
                this.searchByKeywords(this._searchKeywords);
        }
        return true;
    }

    _about() {
        const aboutDialog = new Adw.AboutDialog({
            application_name: _('Characters'),
            application_icon: pkg.name,
            developer_name: _('The GNOME Project'),
            designers: [
                'Allan Day <allanpday@gmail.com>',
                'Jakub Steiner <jimmac@gmail.com>',
                'Hylke Bons <hello@planetpeanut.studio>',
            ],
            developers: [
                'Daiki Ueno <dueno@src.gnome.org>',
                'Giovanni Campagna <scampa.giovanni@gmail.com>',
            ],
            // TRANSLATORS: put your names here, one name per line.
            translator_credits: _('translator-credits'),
            copyright: 'Copyright 2014-2018 Daiki Ueno',
            license_type: Gtk.License.GPL_2_0,
            version: pkg.version,
            website: 'https://apps.gnome.org/Characters/',
            issue_url: 'https://gitlab.gnome.org/GNOME/gnome-characters/-/issues/',
        });

        aboutDialog.present(this);
    }

    get maxRecentCharacters() {
        return this._maxRecentCharacters;
    }

    set maxRecentCharacters(v) {
        this._maxRecentCharacters = v;
        if (this.recentCharacters.length > this._maxRecentCharacters) {
            this.recentCharacters = this.recentCharacters.slice(
                0, this._maxRecentCharacters);
        }
    }

    searchByKeywords(keywords) {
        this._charactersView.searchByKeywords(keywords)
            .then(totalResults => {
                if (totalResults === 0)
                    this._mainStack.visible_child_name = 'no-results';
                else
                    this._mainStack.visible_child_name = 'character-list';
            });
    }

    setSearchKeywords(terms) {
        this._searchEntry.set_text(terms.join(' '));
        this._searchButton.set_active(true);
    }

    setPage(pageItem) {
        if (pageItem.category === Gc.Category.NONE) {
            // always draw a baseline for recent view
            this._charactersView.baseline = true;
            if (this.recentCharacters.length === 0) {
                this._mainStack.visible_child_name = 'empty-recent';
            } else {
                this._charactersView.setCharacters(this.recentCharacters);
                this._mainStack.visible_child_name = 'character-list';
            }
        } else {
            this._charactersView.searchByCategory(pageItem.category);

            this._mainStack.visible_child_name = 'character-list';
            // this._charactersView.model = pageRow.model;
        }
    }

    addToRecent(uc) {
        if (this.recentCharacters.indexOf(uc) < 0) {
            this.recentCharacters.unshift(uc);
            if (this.recentCharacters.length > this._maxRecentCharacters) {
                this.recentCharacters = this.recentCharacters.slice(
                    0, this._maxRecentCharacters);
            }
            Main.settings.set_value(
                'recent-characters',
                GLib.Variant.new_strv(this.recentCharacters));
        }
    }

    _handleCharacterSelected(widget, uc) {
        const dialog = new CharacterDialog(uc, this._charactersView.fontDescription);
        dialog.connect('character-copied', (_widget, char) => {
            this.addToRecent(char);
        });
        dialog.present(this);
    }
});
