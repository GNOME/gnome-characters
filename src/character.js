// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (C) 2014  Daiki Ueno <dueno@src.gnome.org>
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

const Lang = imports.lang;
const Params = imports.params;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const Gc = imports.gi.Gc;
const Main = imports.main;
const Util = imports.util;

const CharacterDialog = new Lang.Class({
    Name: 'CharacterDialog',
    Extends: Gtk.Dialog,
    Template: 'resource:///org/gnome/Characters/character.ui',
    InternalChildren: ['main-stack', 'character-label', 'detail-label',
                       'copy-button', 'related-listbox'],

    _init: function(params) {
        let filtered = Params.filter(params, { character: null,
                                               fontDescription: null });
        params = Params.fill(params, { use_header_bar: true,
                                       width_request: 400,
                                       height_request: 400 });
        this.parent(params);

        this._cancellable = new Gio.Cancellable();

        this._copy_button.connect('clicked', Lang.bind(this, this._copyCharacter));

        this._related_listbox.connect('row-selected',
                                      Lang.bind(this, this._handleRowSelected));

        this._relatedButton = new Gtk.ToggleButton({ label: _("See Also") });
        this.add_action_widget(this._relatedButton, Gtk.ResponseType.HELP);
        this._relatedButton.show();

        this._relatedButton.connect(
            'toggled',
            Lang.bind(this, function() {
                if (this._main_stack.visible_child_name == 'character')
                    this._main_stack.visible_child_name = 'related';
                else
                    this._main_stack.visible_child_name = 'character';
            }));

        this._character_label.override_font(filtered.fontDescription);
        this._setCharacter(filtered.character);
    },

    _finishSearch: function(result) {
        for (let index = 0; index < result.len; index++) {
            let uc = Gc.search_result_get(result, index);
            let name = Gc.character_name(uc);
            if (name == null)
                continue;

            let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

            let characterLabel = new Gtk.Label({ label: uc,
                                                 valign: Gtk.Align.CENTER,
                                                 halign: Gtk.Align.CENTER,
                                                 width_request: 45 });
            characterLabel.get_style_context().add_class('character');
            hbox.pack_start(characterLabel, false, false, 2);

            let nameLabel = new Gtk.Label({ label: Util.capitalize(name),
                                            halign: Gtk.Align.START });
            hbox.pack_start(nameLabel, true, true, 0);

            let row = new Gtk.ListBoxRow();
            row._character = uc;
            row.add(hbox);
            row.show_all();

            this._related_listbox.add(row);
        }

        this._relatedButton.visible =
            this._related_listbox.get_children().length > 0;
    },

    _setCharacter: function(uc) {
        this._character = uc;

        this._character = this._character;
        this._character_label.label = this._character;

        let codePoint = this._character.charCodeAt(0);
        let codePointHex = codePoint.toString(16).toUpperCase();
        this._detail_label.label = _("Unicode U+%04s").format(codePointHex);

        let children = this._related_listbox.get_children();
        for (let index in children)
            this._related_listbox.remove(children[index]);

        this._cancellable.cancel();
        this._cancellable.reset();
        Gc.search_related(
            this._character,
            -1,
            this._cancellable,
            Lang.bind(this, function(source_object, res, user_data) {
                try {
                    let result = Gc.search_finish(res);
                    this._finishSearch(result);
                } catch (e) {
                    log("Failed to search related: " + e);
                }
            }));

        this._relatedButton.active = false;
        this._main_stack.visible_child_name = 'character';
        this._main_stack.show_all();

        let headerBar = this.get_header_bar();
        let name = Gc.character_name(this._character);
        if (name != null)
            headerBar.title = Util.capitalize(name);
    },

    _copyCharacter: function() {
        let clipboard = Gc.gtk_clipboard_get();
        // FIXME: GLib.unichar_to_utf8() has missing (nullable)
        // annotation to the outbuf argument.
        let outbuf = '      ';
        let length = GLib.unichar_to_utf8(this._character, outbuf);
        clipboard.set_text(this._character, length);
    },

    _handleRowSelected: function(listBox, row) {
        if (row != null) {
            this._setCharacter(row._character);
            let toplevel = this.get_transient_for();
            let action = toplevel.lookup_action('character');
            action.activate(new GLib.Variant('s', row._character));
        }
    },
});
