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


const {Adw, Gc, GLib, GObject, Gtk, GnomeDesktop} = imports.gi;

const Gettext = imports.gettext;

const Util = imports.util;

var MainCategories = [
    {
        name: 'emojis',
        category: Gc.Category.EMOJI,
        title: N_('Emojis'),
        icon_name: 'characters-emoji-smileys',
    },
    {
        name: 'letters',
        category: Gc.Category.LETTER,
        title: N_('Letters & Symbols'),
        icon_name: 'characters-latin-symbolic',
    }
];

const LetterCategoryList = [
    {
        name: 'punctuation',
        category: Gc.Category.LETTER_PUNCTUATION,
        title: N_('Punctuation'),
        icon_name: 'characters-punctuation-symbolic',
    },
    {
        name: 'arrow',
        category: Gc.Category.LETTER_ARROW,
        title: N_('Arrows'),
        icon_name: 'characters-arrow-symbolic',
    },
    {
        name: 'bullet',
        category: Gc.Category.LETTER_BULLET,
        title: N_('Bullets'),
        icon_name: 'characters-bullet-symbolic',
    },
    {
        name: 'picture',
        category: Gc.Category.LETTER_PICTURE,
        title: N_('Pictures'),
        icon_name: 'characters-picture-symbolic',
    },
    {
        name: 'currency',
        category: Gc.Category.LETTER_CURRENCY,
        title: N_('Currencies'),
        icon_name: 'characters-currency-symbolic',
    },
    {
        name: 'math',
        category: Gc.Category.LETTER_MATH,
        title: N_('Math'),
        icon_name: 'characters-math-symbolic',
    },
    {
        name: 'letters',
        category: Gc.Category.LETTER_LATIN,
        title: N_('Letters'),
        icon_name: 'characters-latin-symbolic',
    }
];

const EmojiCategoryList = [
    {
        name: 'emoji-smileys',
        category: Gc.Category.EMOJI_SMILEYS,
        title: N_('Smileys & People'),
        icon_name: 'characters-emoji-smileys',
    },
    {
        name: 'emoji-animals',
        category: Gc.Category.EMOJI_ANIMALS,
        title: N_('Animals & Nature'),
        icon_name: 'characters-emoji-animals',
    },
    {
        name: 'emoji-food',
        category: Gc.Category.EMOJI_FOOD,
        title: N_('Food & Drink'),
        icon_name: 'characters-emoji-food',
    },
    {
        name: 'emoji-activities',
        category: Gc.Category.EMOJI_ACTIVITIES,
        title: N_('Activities'),
        icon_name: 'characters-emoji-activities',
    },
    {
        name: 'emoji-travel',
        category: Gc.Category.EMOJI_TRAVEL,
        title: N_('Travel & Places'),
        icon_name: 'characters-emoji-travel',
    },
    {
        name: 'emoji-objects',
        category: Gc.Category.EMOJI_OBJECTS,
        title: N_('Objects'),
        icon_name: 'characters-emoji-objects',
    },
    {
        name: 'emoji-symbols',
        category: Gc.Category.EMOJI_SYMBOLS,
        title: N_('Symbols'),
        icon_name: 'characters-emoji-symbols',
    },
    {
        name: 'emoji-flags',
        category: Gc.Category.EMOJI_FLAGS,
        title: N_('Flags'),
        icon_name: 'characters-emoji-flags',
    }
];

const CategoryListRowWidget = GObject.registerClass({
    Properties: {
        'title': GObject.ParamSpec.string(
            'title',
            'Category title', 'Category title',
            GObject.ParamFlags.READWRITE,
            '',
        ),
        'icon-name': GObject.ParamSpec.string(
            'icon-name',
            'Category Icon Name', 'Category Icon Name',
            GObject.ParamFlags.READWRITE,
            '',
        ),
    },
}, class CategoryListRowWidget extends Gtk.ListBoxRow {
    _init () {
        super._init({});
        /*this.get_accessible().accessible_name =
            _('%s Category List Row').format(category.title);*/

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.set_child(hbox);
        let image = Gtk.Image.new();
        this.bind_property("icon-name", image, "icon-name",
        GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        image.set_icon_size(Gtk.IconSize.LARGE_TOOLBAR);
        image.add_css_class('category-icon');
        hbox.append(image);

        let label = new Gtk.Label({ halign: Gtk.Align.START });
        this.bind_property("title", label, "label",GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        label.add_css_class('category-label');
        hbox.append(label);

        this.add_css_class('category');
    }
});

var Sidebar = GObject.registerClass({
    Properties: {
        'selected-item': GObject.ParamSpec.object(
            'selected-item',
            'Current active category', 'Currently selected category',
            GObject.ParamFlags.READWRITE,
            Gtk.ListBoxRow.$gtype,
        ),
    },
    Template: 'resource:///org/gnome/Characters/sidebar.ui',
    InternalChildren: [
        'list',
        'recentRow', 'emojiSmileysRow', 'emojiAnimalsRow',
        'emojiFoodRow', 'emojiActivitiesRow', 'emojiTravelRow',
        'emojiObjectsRow', 'emojiSymbolsRow', 'emojiFlagsRow',
        'lettersPunctuationRow', 'lettersArrowsRow',
        'lettersBulletsRow', 'lettersPicturesRow',
        'lettersCurrencyRow', 'lettersMathRow', 'lettersLatinRow',
    ],
}, class Sidebar extends Adw.Bin {
    _init() {
        super._init();
    }

    rowByName(name) {
        switch(name) {
            case 'smileys':
                return this._emojiSmileysRow;
            case 'animals':
                return this._emojiAnimalsRow;
            case 'food':
                return this._emojiFoodRow;
            case 'activities':
                return this._emojiActivitesRow;
            case 'travel':
                return this._emojiTravelRow;
            case 'objects':
                return this._emojiObjectsRow;
            case 'symbols':
                return this._emojiSymbolsRow;
            case 'flags':
                return this._emojiFlagsRow;
            case 'punctuation':
                return this._lettersPunctuationRow;
            case 'arrows':
                return this._lettersArrowsRow;
            case 'bullets':
                return this._lettersBulletsRow;
            case 'pictures':
                return this._lettersPicturesRow;
            case 'currency':
                return this._lettersCurrencyRow;
            case 'math':
                return this._lettersMathRow;
            case 'latin':
                return this._lettersLatinRow;
            default:
                return this._recentRow;
       }
    }

    selectRowByName(name) {
        let row = this.rowByName(name);
        this._list.select_row(row);
    }

    get selectedItem() {
        return this._selected_item;
    }

    _finishListEngines(sources, bus, res) {
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
            log(`Failed to list engines: ${e.message}`);
        }
        this._finishBuildScriptList(sources);
    }

    _ensureIBusLanguageList(sources) {
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
        if (bus.is_connected()) {
            bus.list_engines_async(-1, null, (sources, bus, res) => this._finishListEngines(sources, bus, res));
        } else
            this._finishBuildScriptList(sources);
    }

    _finishBuildScriptList(sources) {
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
    }

    populateCategoryList() {
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
    }
});
