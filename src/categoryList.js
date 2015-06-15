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

const Lang = imports.lang;
const Params = imports.params;
const Cairo = imports.cairo;
const PangoCairo = imports.gi.PangoCairo;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gettext = imports.gettext;
const Gc = imports.gi.Gc;
const Main = imports.main;

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
    },
    {
        name: 'local',
        category: Gc.Category.NONE,
        title: N_('Local scripts')
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
        this.get_accessible().accessible_name =
            _('%s Category List Row').format(category.title);

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                 margin_start: 10 });
        this.add(hbox);

        let image;
        if (category.name == 'local') {
            image = this._createScriptsImage();
        } else {
            let icon = new Gio.ThemedIcon({ name: category.icon_name });
            image = Gtk.Image.new_from_gicon(icon, Gtk.IconSize.LARGE_TOOLBAR);
        }
        image.get_style_context().add_class('category-image');
        hbox.pack_start(image, false, false, 2);

        let label = new Gtk.Label({ label: Gettext.gettext(category.title),
                                    halign: Gtk.Align.START });
        label.get_style_context().add_class('category-label');
        hbox.pack_start(label, true, true, 0);
    },

    _createScriptsImage: function() {
        let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 24, 24);
        let cr = new CairoContext(surface);
        let layout = PangoCairo.create_layout(cr);

        let context = this.get_pango_context();
        layout.get_context().set_font_map(context.get_font_map());
        let fontDescription = context.get_font_description();
        fontDescription.set_size(16 * Pango.SCALE);
        layout.set_font_description(fontDescription);

        let [uc, length] =
            Main.settings.get_value('scripts-character').get_string();
        layout.set_text(uc, length);
        PangoCairo.show_layout(cr, layout);

        return Gtk.Image.new_from_surface(surface);
    }
});

const CategoryListWidget = new Lang.Class({
    Name: 'CategoryListWidget',
    Extends: Gtk.ListBox,

    _init: function(params) {
        params = Params.fill(params, {});
        this.parent(params);

        // Mimic GtkStackSidebar to take advantage of the standard theme.
        this.get_style_context().add_class('sidebar');

        let scripts = Main.settings.get_value('scripts').get_strv();
        let scripts_visible = scripts.length > 0;

        for (let index in Category) {
            let category = Category[index];
            if (category.name == 'local' && !scripts_visible)
                continue;
            let rowWidget = new CategoryListRowWidget({}, category);
            // Mimic GtkStackSidebar to take advantage of the standard theme.
            rowWidget.get_style_context().add_class('sidebar-item');
            this.add(rowWidget);
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
