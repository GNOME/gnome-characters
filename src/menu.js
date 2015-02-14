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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;
const Pango = imports.gi.Pango;

const MenuPopover = new Lang.Class({
    Name: 'MenuPopover',
    Extends: Gtk.Popover,
    Template: 'resource:///org/gnome/Characters/menu.ui',
    InternalChildren: ['search-entry', 'font-listbox'],

    _init: function(params) {
        params = Params.fill(params, {});
        this.parent(params);

        let context = this.get_pango_context();
        let families = context.list_families();
        families = families.sort(function(a, b) {
            return a.get_name().localeCompare(b.get_name());
        });
        for (let index in families) {
            let row = new Gtk.ListBoxRow({ visible: true });
            row._family = families[index];
            row.add(new Gtk.Label({ label: row._family.get_name(),
				    visible: true,
                                    halign: Gtk.Align.START }));
            this._font_listbox.add(row);
        }

        this._keywords = [];
        this._search_entry.connect('search-changed',
                                   Lang.bind(this, this._handleSearchChanged));
        this._font_listbox.connect('row-activated',
                                   Lang.bind(this, this._handleRowActivated));
        this._font_listbox.set_filter_func(Lang.bind(this, this._filterFunc));

        // This silents warning at Characters exit about this widget being
        // visible but not mapped.  Borrowed from Maps.
        this.connect('unmap', function(popover) { popover.hide(); });
    },

    _handleSearchChanged: function(entry) {
        let text = entry.get_text().replace(/^\s+|\s+$/g, '');
        let keywords = text == '' ? [] : text.split(/\s+/);
        this._keywords = keywords.map(String.toLowerCase);
	this._font_listbox.invalidate_filter();
        return true;
    },

    _handleRowActivated: function(listBox, row) {
        if (row != null) {
            let toplevel = this.get_toplevel();
            let action = toplevel.lookup_action('filter-font');
            action.activate(new GLib.Variant('s', row._family.get_name()));
        }
    },

    _filterFunc: function(row) {
        if (this._keywords.length == 0)
	    return true;
	else {
            let name = row._family.get_name();
            let nameWords = name.split(/\s+/).map(String.toLowerCase);
	    return this._keywords.some(function(keyword, index, array) {
		return nameWords.some(function(nameWord, index, array) {
		    return nameWord.indexOf(keyword) >= 0;
		});
	    });
	}
    }
});
