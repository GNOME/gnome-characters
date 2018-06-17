// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (C) 2015  Daiki Ueno <dueno@src.gnome.org>
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

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;

var MenuPopover = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/menu.ui',
    InternalChildren: ['search-entry', 'font-listbox'],
}, class MenuPopover extends Gtk.Popover {
    _createFontListRow(title, family) {
        const row = new Gtk.ListBoxRow({ visible: true });
        row.get_style_context().add_class('font');
        row._family = family;
        const label = new Gtk.Label({ label: title,
                                    visible: true,
                                    halign: Gtk.Align.START });
        label.get_style_context().add_class('font-label');
        row.add(label);
        return row;
    }

    _init(params) {
        params = Params.fill(params, {});
        super._init(params);

        this._font_listbox.get_style_context().add_class('fonts');
        let row = this._createFontListRow(_('None'), 'None');
        this._font_listbox.add(row);

        const context = this.get_pango_context();
        let families = context.list_families();
        families = families.sort(function(a, b) {
            return a.get_name().localeCompare(b.get_name());
        });
        for (const index in families) {
            row = this._createFontListRow(families[index].get_name(),
                                          families[index].get_name());
            this._font_listbox.add(row);
        }

        this._keywords = [];
        this._search_entry.connect('search-changed',
                                   Lang.bind(this, this._handleSearchChanged));
        this._font_listbox.connect('row-activated',
                                   Lang.bind(this, this._handleRowActivated));
        this._font_listbox.set_filter_func(Lang.bind(this, this._filterFunc));
        this._font_listbox.set_header_func(Lang.bind(this, this._headerFunc));

        // This silents warning at Characters exit about this widget being
        // visible but not mapped.  Borrowed from Maps.
        this.connect('unmap', (popover) => {
            popover._font_listbox.unselect_all();
            popover.hide();
        });
    }

    _handleSearchChanged(entry) {
        const text = entry.get_text().replace(/^\s+|\s+$/g, '');
        const keywords = text == '' ? [] : text.split(/\s+/);
        this._keywords = keywords.map(String.toLowerCase);
        this._font_listbox.invalidate_filter();
        return true;
    }

    _handleRowActivated(listBox, row) {
        if (row != null) {
            const toplevel = this.get_toplevel();
            const action = toplevel.lookup_action('filter-font');
            action.activate(new GLib.Variant('s', row._family));
        }
    }

    _filterFunc(row) {
        if (this._keywords.length == 0)
            return true;
        if (row._family == 'None')
            return true;

        const nameWords = row._family.split(/\s+/).map(String.toLowerCase);
        return this._keywords.every(function(keyword, index, array) {
            return nameWords.some(function(nameWord, index, array) {
                return nameWord.indexOf(keyword) >= 0;
            });
        });
    }

    _headerFunc(row, before) {
        if (before && !row.get_header()) {
            const separator = new Gtk.Separator({
                orientation: Gtk.Orientation.HORIZONTAL,
            });
            row.set_header (separator);
        }
    }
});
