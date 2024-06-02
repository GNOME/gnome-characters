/* exported CharacterDialog */
// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (C) 2014-2015  Daiki Ueno <dueno@src.gnome.org>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

const { Adw, Gc, Gdk, Gio, GObject, Gtk, Pango } = imports.gi;

const Util = imports.util;

var CharacterDialog = GObject.registerClass({
    Signals: {
        'character-copied': { param_types: [GObject.TYPE_STRING] },
        'add-to-favorites': { param_types: [GObject.TYPE_STRING] },  // New signal
        'remove-from-favorites': { param_types: [GObject.TYPE_STRING] }, // New signal
    },
    Template: 'resource:///org/gnome/Characters/character_dialog.ui',
    InternalChildren: [
        'characterStack', 'navigationView',
        'characterLabel', 'missingLabel',
        'detailRow', 'detailLabel',
        'seeAlsoRow', 'relatedPage', 'relatedListbox',
        'toastOverlay',
    ],
}, class CharacterDialog extends Adw.Dialog {
    _init(character, fontDescription, fromFavorites) {
        super._init();
        this._cancellable = new Gio.Cancellable();
        this._fontDescription = fontDescription;
        this.favoriteCharacters = []; // Initialize as an empty array or fetch from settings
        this._maxFavoriteCharacters = 20; // Set your desired max limit
        this._fromFavorites = fromFavorites; // Store the new parameter

        const actions = new Gio.SimpleActionGroup();
        Util.initActions(actions, [
            { name: 'copy', activate: this._copyCharacter.bind(this) },
            { name: 'add-to-favorites', activate: this._addToFavorites.bind(this) },
            // { name: 'remove-from-favorites', activate: this._removeFromFavorites.bind(this) }, // New action
        ]);
        this.insert_action_group('character', actions);

        this._relatedPage.connect('hidden', () => {
            this._populateRelatedPage();
        });

        // if (this._fromFavorites) {
        //     this._addRemoveFromFavoritesButton();
        // }

        this._setCharacter(character);
    }

    // _addRemoveFromFavoritesButton() {
    //     const button = new Gtk.Button({
    //         label: "Remove from Favorites",
    //         action_name: "character.remove-from-favorites"
    //     });
    //     // button.connect('clicked', () => {
    //     //     this._removeFromFavorites();
    //     // });
    //     // this._buttonBox.add(button); // Ensure this container is correctly referenced
    // }

    // _removeFromFavorites() {
    //     console.log('Remove from Favorites button clicked'); // Log when button is clicked
    //     const index = this.favoriteCharacters.indexOf(this._character);
    //     if (index > -1) {
    //         this.favoriteCharacters.splice(index, 1);
    //         console.log('Removed from favorites:', this._character);
    //         console.log('Updated favorites:', this.favoriteCharacters);
    //     }
    //     this.emit('remove-from-favorites', this._character);
    // }

    _finishSearch(result) {
        this._related = result;
        this._seeAlsoRow.visible = result.len > 0;

        if (!this._relatedPage.get_mapped())
            this._populateRelatedPage();
    }

    _populateRelatedPage() {
        this._relatedListbox.remove_all();

        for (let index = 0; index < this._related.len; index++) {
            let uc = Gc.search_result_get(this._related, index);
            let name = Gc.character_name(uc);
            if (name === null)
                continue;

            let row = new Adw.ActionRow();
            row.set_title(Util.capitalize(name));
            row.add_prefix(new Gtk.Label({
                label: uc,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
                width_request: 45,
            }));
            row.connect('activated', () => {
                this._setCharacter(uc);
                this._navigationView.pop();
            });
            row.set_activatable(true);
            this._relatedListbox.append(row);
        }
    }

    _addToFavorites() {
        console.log("Add to Favorites clicked");
        this.addToFavorites(this._character);  // This line adds the character to favorites
        // Add any additional code here to update the UI
        this.emit('add-to-favorites', this._character); // Emit the new signal
    }

    addToFavorites(uc) {
        log(`Adding to favorites: ${uc}`);
        if (this.favoriteCharacters.indexOf(uc) < 0) {
            this.favoriteCharacters.unshift(uc);
            console.log(this.favoriteCharacters); // Log the current state of favoriteCharacters
            if (this.favoriteCharacters.length > this._maxFavoriteCharacters) {
                this.favoriteCharacters = this.favoriteCharacters.slice(0, this._maxFavoriteCharacters);
            }
            // Update the favorite characters list in the UI or local storage as needed
            const toast = new Adw.Toast({
                title: _('Character added to favorites'),
                timeout: 2,
            });
            this._toastOverlay.add_toast(toast);
        }
    }

    _setCharacter(uc) {
        this._character = uc;

        let name = Gc.character_name(this._character);
        if (name !== null)
            name = Util.capitalize(name);

        if (Gc.character_is_composite(uc)) {
            this._detailRow.hide();

            if (name === null)
                name = _('Unknown character name');
        } else {
            let codePoint = Util.toCodePoint(this._character);
            let codePointHex = codePoint.toString(16).toUpperCase();

            this._detailLabel.label = 'U+%04s'.format(codePointHex);
            this._detailRow.show();

            if (name === null)
                name = 'U+%04s'.format(codePointHex);
        }

        this.title = name ? name : '';
        this._characterLabel.label = this._character;

        let pangoContext = this._characterLabel.get_pango_context();
        pangoContext.set_font_description(this._fontDescription);

        var pangoLayout = Pango.Layout.new(pangoContext);
        pangoLayout.set_text(this._character, -1);
        if (pangoLayout.get_unknown_glyphs_count() === 0) {
            this._characterStack.visible_child_name = 'character';
        } else {
            var fontFamily = this._fontDescription.get_family();
            // TRANSLATORS: the first variable is a character, the second is a font
            this._missingLabel.label = _('%s is not included in %s').format(name, fontFamily);
            this._characterStack.visible_child_name = 'missing';
        }

        this._cancellable.cancel();
        this._cancellable.reset();
        let criteria = Gc.SearchCriteria.new_related(this._character);
        let context = new Gc.SearchContext({ criteria });
        context.search(
            -1,
            this._cancellable,
            (ctx, res) => {
                try {
                    let result = ctx.search_finish(res);
                    this._finishSearch(result);
                } catch (e) {
                    log(`Failed to search related: ${e.message}`);
                }
            });

        this._seeAlsoRow.visible = false;
    }

    _copyCharacter() {
        let display = Gdk.Display.get_default();
        let clipboard = display.get_clipboard();

        clipboard.set(this._character);
        this.emit('character-copied', this._character);

        const toast = new Adw.Toast({
            title: _('Character copied to clipboard'),
            timeout: 2,
        });
        this._toastOverlay.add_toast(toast);
    }
});
