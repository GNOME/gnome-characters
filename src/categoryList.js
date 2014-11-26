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
const Gtk = imports.gi.Gtk;
const Gettext = imports.gettext;
const Gc = imports.gi.Gc;

const Category = [
    {
        name: 'recent',
        category: Gc.Category.NONE,
        title: N_('Recently Used'),
        icon_name: 'document-open-recent-symbolic'
    },
    {
        name: 'punctuation',
        category: Gc.Category.PUNCTUATION,
        title: N_('Punctuation'),
        icon_name: 'characters-punctuation-symbolic'
    },
    {
        name: 'arrow',
        category: Gc.Category.ARROW,
        title: N_('Arrows'),
        icon_name: 'characters-arrow-symbolic'
    },
    {
        name: 'bullet',
        category: Gc.Category.BULLET,
        title: N_('Bullets'),
        icon_name: 'characters-bullet-symbolic'
    },
    {
        name: 'picture',
        category: Gc.Category.PICTURE,
        title: N_('Pictures'),
        icon_name: 'characters-picture-symbolic'
    },
    {
        name: 'currency',
        category: Gc.Category.CURRENCY,
        title: N_('Currencies'),
        icon_name: 'characters-currency-symbolic'
    },
    {
        name: 'math',
        category: Gc.Category.MATH,
        title: N_('Math'),
        icon_name: 'characters-math-symbolic'
    },
    {
        name: 'latin',
        category: Gc.Category.LATIN,
        title: N_('Latin'),
        icon_name: 'characters-latin-symbolic'
    },
    {
        name: 'emoticon',
        category: Gc.Category.EMOTICON,
        title: N_('Emoticons'),
        icon_name: 'face-smile-symbolic'
    }
];

const CategoryListRowWidget = new Lang.Class({
    Name: 'CategoryListRowWidget',
    Extends: Gtk.ListBoxRow,

    _init: function(params, category) {
        params = Params.fill(params, {});
        this.parent(params);
        this.category = category;
        this.get_style_context().add_class('category-list-row');

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.add(hbox);

        let icon = new Gio.ThemedIcon({ name: category.icon_name });
        let image = Gtk.Image.new_from_gicon(icon, Gtk.IconSize.LARGE_TOOLBAR);
        image.get_style_context().add_class('category-image');
        hbox.pack_start(image, false, false, 2);

        let label = new Gtk.Label({ label: Gettext.gettext(category.title),
                                    halign: Gtk.Align.START });
        label.get_style_context().add_class('category-label');
        hbox.pack_start(label, true, true, 0);
    }
});

const CategoryListWidget = new Lang.Class({
    Name: 'CategoryListWidget',
    Extends: Gtk.ListBox,

    _init: function(params) {
        params = Params.fill(params, {});
        this.parent(params);

        for (let index in Category) {
            let category = Category[index];
            this.add(new CategoryListRowWidget({}, category));
        }
    },

    vfunc_row_selected: function(row) {
        if (row != null) {
            let toplevel = row.get_toplevel();
            let category = toplevel.lookup_action('category');
            category.activate(new GLib.Variant('s', row.category.name));
        }
    },
});
