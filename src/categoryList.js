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
const GnomeDesktop = imports.gi.GnomeDesktop;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gettext = imports.gettext;
const Gc = imports.gi.Gc;
const Util = imports.util;

const BaseCategoryList = [
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
        name: 'letters',
        category: Gc.Category.LATIN,
        title: N_('Letters'),
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
        this.get_accessible().accessible_name =
            _('%s Category List Row').format(category.title);

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.add(hbox);

        let icon = new Gio.ThemedIcon({ name: category.icon_name });
        let image = Gtk.Image.new_from_gicon(icon, Gtk.IconSize.LARGE_TOOLBAR);
        image.get_style_context().add_class('category-icon');
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

        this.get_style_context().add_class('categories');

        this._ensureCategoryList();

        for (let index in this._categoryList) {
            let category = this._categoryList[index];
            let rowWidget = new CategoryListRowWidget({}, category);
            rowWidget.get_style_context().add_class('category');
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

    _finishListEngines: function(sources, bus, res) {
        try {
            let engines = bus.list_engines_async_finish(res);
            if (engines) {
                for (let j in engines) {
                    let engine = engines[j];
                    let language = engine.get_language();
                    if (language != null)
                        this._ibusLanguageList[engine.get_name()] = language;
                }
            }
        } catch (e) {
            log("Failed to list engines: " + e);
        }
        this._finishBuildScriptList(sources);
    },

    _ensureIBusLanguageList: function(sources) {
        if (this._ibusLanguageList != null)
            return;

        this._ibusLanguageList = {};

        // Don't assume IBus is always available.
        let ibus;
        try {
            ibus = imports.gi.IBus;
        } catch (e) {
            this._finishBuildScriptList(sources);
            return;
        }

        ibus.init();
        let bus = new ibus.Bus();
        bus.list_engines_async(-1,
                               null,
                               Lang.bind(this, function (bus, res) {
                                   this._finishListEngines(sources, bus, res);
                               }));
    },

    _finishBuildScriptList: function(sources) {
        let xkbInfo = new GnomeDesktop.XkbInfo();
        let languages = [];
        for (let i in sources) {
            let [type, id] = sources[i];
            switch (type) {
            case 'xkb':
                // FIXME: Remove this check once gnome-desktop gets the
                // support for that.
                if (xkbInfo.get_languages_for_layout) {
                    languages = languages.concat(
                        xkbInfo.get_languages_for_layout(id));
                }
                break;
            case 'ibus':
                if (id in this._ibusLanguageList)
                    languages.push(this._ibusLanguageList[id]);
                break;
            }
        }

        // Add current locale language to languages.
        languages.push(Gc.get_current_language());

        let allScripts = [];
        for (let i in languages) {
            let language = GnomeDesktop.normalize_locale(languages[i]);
            if (language == null)
                continue;
            let scripts = Gc.get_scripts_for_language(languages[i]);
            for (let j in scripts) {
                let script = scripts[j];
                // Exclude Latin and Han, since Latin is always added
                // at the top and Han contains too many characters.
                if (['Latin', 'Han'].indexOf(script) >= 0)
                    continue;
                if (allScripts.indexOf(script) >= 0)
                    continue;
                allScripts.push(script);
            }
        }

        allScripts.unshift('Latin');
        let category = this.getCategory('letters');
        category.scripts = allScripts;
    },

    _buildScriptList: function() {
        let settings =
            Util.getSettings('org.gnome.desktop.input-sources',
                             '/org/gnome/desktop/input-sources/');
        if (settings) {
            let sources = settings.get_value('sources').deep_unpack();
            let hasIBus = sources.some(function(current, index, array) {
                return current[0] == 'ibus';
            });
            if (hasIBus)
                this._ensureIBusLanguageList(sources);
            else
                this._finishBuildScriptList(sources);
        }
    },

    _ensureCategoryList: function() {
        if (this._categoryList != null)
            return;

        this._categoryList = BaseCategoryList.slice();

        // Populate the "scripts" element of the "Letter" category
        // object, based on the current locale and the input-sources
        // settings.
        //
        // This works asynchronously, in the following call flow:
        //
        // _buildScriptList()
        //    if an IBus input-source is configured:
        //       _ensureIBusLanguageList()
        //          ibus_bus_list_engines_async()
        //             _finishListEngines()
        //                _finishBuildScriptList()
        //    else:
        //       _finishBuildScriptList()
        //
        this._buildScriptList();
    },

    getCategoryList: function() {
        return this._categoryList;
    },

    getCategory: function(name) {
        for (let index in this._categoryList) {
            let category = this._categoryList[index];
            if (category.name == name)
                return category;
        }
        return null;
    }
});
