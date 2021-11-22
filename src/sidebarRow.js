/* exported SidebarRow */
// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (C) 2014-2017  Daiki Ueno <dueno@src.gnome.org>
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

const { Gc, GObject, Gtk } = imports.gi;

var SidebarRow = GObject.registerClass({
    Properties: {
        'title': GObject.ParamSpec.string(
            'title',
            'Category title', 'Category title',
            GObject.ParamFlags.READWRITE,
            '',
        ),
        'category': GObject.ParamSpec.enum(
            'category',
            'Category', 'Category',
            GObject.ParamFlags.READWRITE,
            Gc.Category.$gtype,
            Gc.Category.NONE,
        ),
        'icon-name': GObject.ParamSpec.string(
            'icon-name',
            'Category Icon Name', 'Category Icon Name',
            GObject.ParamFlags.READWRITE,
            '',
        ),
    },
}, class SidebarRow extends Gtk.ListBoxRow {
    _init() {
        super._init({
            accessible_role: Gtk.AccessibleRole.ROW,
        });

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

        let image = new Gtk.Image({ margin_end: 10 });
        this.bind_property('icon-name', image, 'icon-name',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE,
        );
        image.set_icon_size(Gtk.IconSize.LARGE_TOOLBAR);
        hbox.append(image);

        let label = new Gtk.Label({ halign: Gtk.Align.START });
        this.bind_property('title', label, 'label',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE,
        );
        // Because bind_property doesn't work with transform functions
        // TODO: is this really needed?
        this.connect('notify::title', row => {
            row.tooltip_text = _('%s Sidebar Row').format(row.title);
        });

        hbox.append(label);

        this.set_child(hbox);
    }

    get title() {
        return this._title || '';
    }

    set title(title) {
        this._title = title;
    }

    get category() {
        return this._category || Gc.Category.NONE;
    }

    set category(value) {
        this._category = value;
    }
});

