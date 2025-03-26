/* exported SidebarItem */
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

const { Gc, GObject, Adw } = imports.gi;

var SidebarItem = GObject.registerClass({
    Properties: {
        'category': GObject.ParamSpec.enum(
            'category',
            'Category', 'Category',
            GObject.ParamFlags.READWRITE,
            Gc.Category.$gtype,
            Gc.Category.NONE,
        ),
    },
}, class SidebarItem extends Adw.SidebarItem {
    get category() {
        return this._category || Gc.Category.NONE;
    }

    set category(value) {
        this._category = value;
    }
});

