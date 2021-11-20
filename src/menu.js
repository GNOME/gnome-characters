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

const {GLib, GObject, Gtk} = imports.gi;

var MenuPopover = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/menu.ui',
    InternalChildren: ['search-entry', 'font-listbox'],
}, class MenuPopover extends Gtk.Popover {
    _createFontListRow(title, family) {
        const row = new Gtk.ListBoxRow();
        row.add_css_class('font');
        row._family = family;
        let label = new Gtk.Label({ label: title,
                                    halign: Gtk.Align.START });
        label.add_css_class('font-label');
        row.set_child(label);
        return row;
    }

    _init() {
        super._init({});
        let row = this._createFontListRow(_("None"), 'None');
        this._font_listbox.append(row);

        let context = this.get_pango_context();
        let families = context.list_families();
        families = families.sort(function(a, b) {
            return a.get_name().localeCompare(b.get_name());
        });
        for (let index in families) {
            row = this._createFontListRow(families[index].get_name(),
                                          families[index].get_name());
            this._font_listbox.append(row);
        }

        this._keywords = [];
        this._search_entry.connect('search-changed', (entry) => this._handleSearchChanged(entry));
        this._font_listbox.connect('row-activated', (listBox, row) => this._handleRowActivated(listBox, row));
        this._font_listbox.set_filter_func((row) => this._filterFunc(row));

        // This silents warning at Characters exit about this widget being
        // visible but not mapped.  Borrowed from Maps.
        this.connect('unmap', function(popover) {
            popover._font_listbox.unselect_all();
            popover.hide();
        });
    }

    _handleSearchChanged(entry) {
        let text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text == '' ? [] : text.split(/\s+/);
        this._keywords = keywords.map(x => x.toLowerCase());
        this._font_listbox.invalidate_filter();
        return true;
    }

    _handleRowActivated(listBox, row) {
        if (row != null) {
            let toplevel = this.get_root();
            let action = toplevel.lookup_action('filter-font');
            action.activate(new GLib.Variant('s', row._family));
        }
    }

    _filterFunc(row) {
        if (this._keywords.length == 0)
            return true;
        if (row._family == 'None')
            return true;

        let nameWords = row._family.split(/\s+/).map(x => x.toLowerCase());
        return this._keywords.every(function(keyword, index, array) {
            return nameWords.some(function(nameWord, index, array) {
                return nameWord.indexOf(keyword) >= 0;
            });
        });
    }
});
