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


const {Gc, GLib, GObject, Gtk, GnomeDesktop} = imports.gi;

const Gettext = imports.gettext;
const Params = imports.params;

const Util = imports.util;

const CategoryList = [
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
}, class CategoryListRowWidget extends Gtk.ListBoxRow {

    _init (params, category) {
        params = Params.fill(params, {});
        super._init(params);
        this.category = category;
        this.get_accessible().accessible_name =
            _('%s Category List Row').format(category.title);

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.add(hbox);

        let image = Gtk.Image.new_from_icon_name(category.icon_name, Gtk.IconSize.LARGE_TOOLBAR);
        image.get_style_context().add_class('category-icon');
        hbox.pack_start(image, false, false, 2);

        let label = new Gtk.Label({ label: Gettext.gettext(category.title),
                                    halign: Gtk.Align.START });
        label.get_style_context().add_class('category-label');
        hbox.pack_start(label, true, true, 0);

    }
});

const CategoryListWidget = GObject.registerClass({
}, class CategoryListWidget extends Gtk.ListBox {
    _init(params) {
        const filtered = Params.filter(params, { categoryList: null });
        params = Params.fill(params, {});
        super._init(params);


        this._categoryList = filtered.categoryList;
        this.populateCategoryList();
        this._lastSelectedRow = null;

        for (let index in this._categoryList) {
            let category = this._categoryList[index];
            let rowWidget = new CategoryListRowWidget({}, category);
            rowWidget.get_style_context().add_class('category');
            this.add(rowWidget);
        }
    }

    vfunc_row_selected(row) {
        if (row != null && row.selectable) {
            let toplevel = row.get_toplevel();
            let action = toplevel.lookup_action('category');
            action.activate(new GLib.Variant('s', row.category.name));
            this._lastSelectedRow = row;
        }
    }
    populateCategoryList() {
    }

    getCategoryList() {
        return this._categoryList;
    }

    getCategory(name) {
        for (let index in this._categoryList) {
            let category = this._categoryList[index];
            if (category.name == name)
                return category;
        }
        return null;
    }

    restorePreviousSelection() {
        if (this._lastSelectedRow) {
            this.select_row(this._lastSelectedRow)
        }
    }

    unselect() {
        let selected = this.get_selected_row()
        if (selected)
            this.unselect_row(selected)
    }
});

const LetterCategoryListWidget = GObject.registerClass({
}, class LetterCategoryListWidget extends CategoryListWidget {
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

const EmojiCategoryListWidget = GObject.registerClass({

}, class EmojiCategoryListWidget extends CategoryListWidget {
    _init(params) {
        params = Params.fill(params, {});
        super._init(params);
    }

    getCategory(name) {
        return super.getCategory(name);
    }
});

const RecentCategoryListWidget = GObject.registerClass({

}, class RecentCategoryListWidget extends CategoryListWidget {
    _init(params) {
        super._init(params);
        this.recentCategory = {
            name: 'recent',
            category: Gc.Category.NONE,
            title: N_('Recently Used'),
            icon_name: 'document-open-recent-symbolic',
        };
        this.recentRow = new CategoryListRowWidget({}, this.recentCategory);
        this.recentRow.get_style_context().add_class('category');
        this.recentRow.get_style_context().add_class('recent-category');
        this.add(this.recentRow)
    }

    getCategory(name) {
        return this.recentCategory;
    }
});

var CategoryListView = GObject.registerClass({
}, class CategoryListView extends Gtk.Box {
    _init(params) {
        params = Params.fill(params, {
            hexpand: true, vexpand: true,
            orientation: Gtk.Orientation.VERTICAL,
        });
        this._lastSelectedList = null;
        super._init(params);
        this.get_style_context().add_class('categories-list');

        this._recentCategoryList = new RecentCategoryListWidget();
        this._recentCategoryList.connect('row-selected', (list, row) => {
            this._letterCategoryList.unselect();
            this._emojiCategoryList.unselect();
            this._lastSelectedList = list;
            list.select_row(row);
        });
        this.add(this._recentCategoryList)
        this.add(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));
        
        let emojis_label = new Gtk.Label ({
            label: CategoryList[0].title,
            halign: Gtk.Align.START,
            margin_top: 12,
            margin_start: 12,
            margin_bottom: 12,
            margin_end: 12,
        }); 
        emojis_label.get_style_context().add_class("heading");
        this.add(emojis_label);

        this._emojiCategoryList = new EmojiCategoryListWidget({
            categoryList: EmojiCategoryList
        });
        this._emojiCategoryList.connect('row-selected', (list, row) => {
            this._letterCategoryList.unselect();
            this._recentCategoryList.unselect();
            this._lastSelectedList = list;
            list.select_row(row);
        });
        this.add(this._emojiCategoryList);

        let letters_label = new Gtk.Label ({
            label: CategoryList[1].title,
            halign: Gtk.Align.START,
            margin_top: 12,
            margin_start: 12,
            margin_bottom: 12,
            margin_end: 12,
        });
        letters_label.get_style_context().add_class("heading");
        this.add(letters_label);

        this._letterCategoryList = new LetterCategoryListWidget({
            categoryList: LetterCategoryList
        });
        this._letterCategoryList.connect('row-selected', (list, row) => {
            this._emojiCategoryList.unselect();
            this._recentCategoryList.unselect();
            this._lastSelectedList = list;
            list.select_row(row);
        });
        this.add(this._letterCategoryList);

        this._categoryList = CategoryList.slice();
    }

    getCategoryByName(name) {
        switch (name) {
            case 'emojis':
                return this._emojiCategoryList
            case 'recent':
                return this._recentCategoryList
            default:
                return this._letterCategoryList
        }
    }

    getCategoryList() {
        return this._categoryList;
    }

    get selectedList() {
        return this._lastSelectedList
    }
    

    restorePreviousSelection() {
        if (this._lastSelectedList) {
            this._lastSelectedList.restorePreviousSelection()
        }
    }
});
