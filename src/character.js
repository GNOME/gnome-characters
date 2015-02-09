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
    InternalChildren: ['main-stack', 'character-label', 'detail-grid',
                       'codepoint-label', 'category-label', 'script-label',
                       'block-label',
                       'copy-button', 'related-listbox'],
    Properties: {
        'font': GObject.ParamSpec.string(
            'font', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            'Cantarell')
    },

    get font() {
        return this._font;
    },

    set font(v) {
        if (v == this._font)
            return;

        this._font = v;
        let description = Pango.FontDescription.from_string(this._font);
        this._character_label.override_font(description);

        let children = this._related_listbox.get_children();
        for (let index in children) {
            let label = children[index].get_children()[0];
            label.override_font(description);
        }
    },

    _init: function(params) {
        let filtered = Params.filter(params, { character: null });
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

        Main.settings.bind('font', this, 'font',
                           Gio.SettingsBindFlags.DEFAULT);

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

    _activateLink: function(label, uri) {
        let match = uri.match(/^character:([0-9A-F]+)/);
        if (match) {
            let uc = String.fromCharCode(parseInt(match[1], 16));
            this._setCharacter(uc);
            let toplevel = this.get_transient_for();
            let action = toplevel.lookup_action('character');
            action.activate(new GLib.Variant('s', uc));
            return true;
        }
        return false;
    },

    _setCharacter: function(uc) {
        this._character = uc;

        this._character = this._character;
        this._character_label.label = this._character;

        this._codepoint_label.label =
            _("U+%04s").format(Util.hexCodepoint(uc));
        this._category_label.label = Gc.character_category(uc);
        this._script_label.label = Gc.character_script(uc);
        this._block_label.label = Gc.character_block(uc);

        this._detail_grid.remove_row(4);
        let result = Gc.character_decomposition(uc);
        if (result.len > 0) {
            let decomposition = [];
            for (let index = 0; index < result.len; index++) {
                decomposition.push(Gc.search_result_get(result, index));
            }
            let title = new Gtk.Label({ halign: Gtk.Align.START,
                                        label: _("Decomposition: ") });
            this._detail_grid.attach(title, 0, 4, 1, 1);
            let label = new Gtk.Label({ halign: Gtk.Align.START,
                                        wrap: true,
                                        max_width_chars: 30,
                                        use_markup: true });
            label.label = decomposition.map(function(d) {
                let hex = Util.hexCodepoint(d);
                return _("<a href=\"character:%s\">U+%04s %s</a>").format(
                    hex, hex, Gc.character_name(d));
            }).join(', ');
            label.connect('activate-link', Lang.bind(this, this._activateLink));
            this._detail_grid.attach_next_to(label,
                                            title,
                                            Gtk.PositionType.RIGHT,
                                            1, 1);
        }

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
