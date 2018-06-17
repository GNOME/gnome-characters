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
const Lang = imports.lang;
const Params = imports.params;
const Util = imports.util;

const CategoryList = [
    {
        name: 'emojis',
        category: Gc.Category.EMOJI,
        title: N_('Emojis'),
        icon_name: 'characters-emoji-smileys',
        action_name: 'category',
    },
    {
        name: 'letters',
        category: Gc.Category.LETTER,
        title: N_('Letters & Symbols'),
        icon_name: 'characters-latin-symbolic',
        action_name: 'category',
    },
];

const LetterCategoryList = [
    {
        name: 'punctuation',
        category: Gc.Category.LETTER_PUNCTUATION,
        title: N_('Punctuation'),
        icon_name: 'characters-punctuation-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'arrow',
        category: Gc.Category.LETTER_ARROW,
        title: N_('Arrows'),
        icon_name: 'characters-arrow-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'bullet',
        category: Gc.Category.LETTER_BULLET,
        title: N_('Bullets'),
        icon_name: 'characters-bullet-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'picture',
        category: Gc.Category.LETTER_PICTURE,
        title: N_('Pictures'),
        icon_name: 'characters-picture-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'currency',
        category: Gc.Category.LETTER_CURRENCY,
        title: N_('Currencies'),
        icon_name: 'characters-currency-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'math',
        category: Gc.Category.LETTER_MATH,
        title: N_('Math'),
        icon_name: 'characters-math-symbolic',
        action_name: 'subcategory',
    },
    {
        name: 'letters',
        category: Gc.Category.LETTER_LATIN,
        title: N_('Letters'),
        icon_name: 'characters-latin-symbolic',
        action_name: 'subcategory',
    },
];

const EmojiCategoryList = [
    {
        name: 'emoji-smileys',
        category: Gc.Category.EMOJI_SMILEYS,
        title: N_('Smileys & People'),
        icon_name: 'characters-emoji-smileys',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-animals',
        category: Gc.Category.EMOJI_ANIMALS,
        title: N_('Animals & Nature'),
        icon_name: 'characters-emoji-animals',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-food',
        category: Gc.Category.EMOJI_FOOD,
        title: N_('Food & Drink'),
        icon_name: 'characters-emoji-food',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-activities',
        category: Gc.Category.EMOJI_ACTIVITIES,
        title: N_('Activities'),
        icon_name: 'characters-emoji-activities',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-travel',
        category: Gc.Category.EMOJI_TRAVEL,
        title: N_('Travel & Places'),
        icon_name: 'characters-emoji-travel',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-objects',
        category: Gc.Category.EMOJI_OBJECTS,
        title: N_('Objects'),
        icon_name: 'characters-emoji-objects',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-symbols',
        category: Gc.Category.EMOJI_SYMBOLS,
        title: N_('Symbols'),
        icon_name: 'characters-emoji-symbols',
        action_name: 'subcategory',
    },
    {
        name: 'emoji-flags',
        category: Gc.Category.EMOJI_FLAGS,
        title: N_('Flags'),
        icon_name: 'characters-emoji-flags',
        action_name: 'subcategory',
    },
];

const CategoryListRowWidget = GObject.registerClass({
}, class CategoryListRowWidget extends Gtk.ListBoxRow {

    _init (params, category) {
        params = Params.fill(params, {});
        super._init(params);
        this.category = category;
        this.get_accessible().accessible_name =
            _('%s Category List Row').format(category.title);

        const hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this.add(hbox);

        const pixbuf = Util.loadIcon(category.icon_name, 24);
        const image = Gtk.Image.new_from_pixbuf(pixbuf);
        image.get_style_context().add_class('category-icon');
        hbox.pack_start(image, false, false, 2);

        const label = new Gtk.Label({ label: Gettext.gettext(category.title),
                                    halign: Gtk.Align.START });
        label.get_style_context().add_class('category-label');
        hbox.pack_start(label, true, true, 0);

        if (category.secondary_icon_name) {
            const pixbuf = Util.loadIcon(category.secondary_icon_name, 16);
            const image = Gtk.Image.new_from_pixbuf(pixbuf);
            image.get_style_context().add_class('category-icon');
            hbox.pack_end(image, false, false, 2);
        }
    }
});

const CategoryListWidget = GObject.registerClass({
}, class CategoryListWidget extends Gtk.ListBox {
    _init(params) {
        const filtered = Params.filter(params, { categoryList: null });
        params = Params.fill(params, {});
        super._init(params);

        this.get_style_context().add_class('categories');

        this._categoryList = filtered.categoryList;
        this.populateCategoryList();

        for (const index in this._categoryList) {
            const category = this._categoryList[index];
            const rowWidget = new CategoryListRowWidget({}, category);
            rowWidget.get_style_context().add_class('category');
            this.add(rowWidget);
        }
    }

    vfunc_row_selected(row) {
        if (row != null && row.selectable) {
            const toplevel = row.get_toplevel();
            const action = toplevel.lookup_action(row.category.action_name);
            action.activate(new GLib.Variant('s', row.category.name));
        }
    }

    populateCategoryList() {
    }

    getCategoryList() {
        return this._categoryList;
    }

    getCategory(name) {
        for (const index in this._categoryList) {
            const category = this._categoryList[index];
            if (category.name === name)
                return category;
        }
        return null;
    }
});

const LetterCategoryListWidget = GObject.registerClass({
}, class LetterCategoryListWidget extends CategoryListWidget {
    _finishListEngines(sources, bus, res) {
        try {
            const engines = bus.list_engines_async_finish(res);
            if (engines) {
                for (const j in engines) {
                    const engine = engines[j];
                    const language = engine.get_language();
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
        const bus = new ibus.Bus();
        if (bus.is_connected()) {
            bus.list_engines_async(-1,
                                   null,
                                   Lang.bind(this, function (bus, res) {
                                       this._finishListEngines(sources, bus, res);
                                   }));
        } else
            this._finishBuildScriptList(sources);
    }

    _finishBuildScriptList(sources) {
        const xkbInfo = new GnomeDesktop.XkbInfo();
        let languages = [];
        for (const i in sources) {
            const [type, id] = sources[i];
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

        const allScripts = [];
        for (const i in languages) {
            const language = GnomeDesktop.normalize_locale(languages[i]);
            if (language === null)
                continue;
            const scripts = Gc.get_scripts_for_language(languages[i]);
            for (const j in scripts) {
                const script = scripts[j];
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
        const category = this.getCategory('letters');
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
        const settings =
            Util.getSettings('org.gnome.desktop.input-sources',
                             '/org/gnome/desktop/input-sources/');
        if (settings) {
            const sources = settings.get_value('sources').deep_unpack();
            const hasIBus = sources.some((current, index, array) => current[0] === 'ibus');
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

        let category;
        let rowWidget;

        category = {
            name: 'recent',
            category: Gc.Category.NONE,
            title: N_('Recently Used'),
            icon_name: 'document-open-recent-symbolic',
            action_name: 'subcategory',
        };
        rowWidget = new CategoryListRowWidget({}, category);
        rowWidget.get_style_context().add_class('category');
        this.prepend(rowWidget);
        this._recentCategory = category;

        category = {
            name: 'letters',
            category: Gc.Category.NONE,
            title: N_('Letters & Symbols'),
            icon_name: 'characters-latin-symbolic',
            secondary_icon_name: 'go-next-symbolic',
            action_name: 'category',
        };
        rowWidget = new CategoryListRowWidget({}, category);
        rowWidget.get_style_context().add_class('category');
        const separator = new Gtk.Separator();
        const separatorRowWidget = new Gtk.ListBoxRow({ selectable: false });
        separatorRowWidget.add(separator);
        this.add(separatorRowWidget);
        this.add(rowWidget);
    }

    getCategory(name) {
        if (name == 'recent')
            return this._recentCategory;
        return super.getCategory(name);
    }
});

var CategoryListView = GObject.registerClass({
}, class CategoryListView extends Gtk.Stack {
    _init(params) {
        params = Params.fill(params, {
            hexpand: true, vexpand: true,
            transition_type: Gtk.StackTransitionType.SLIDE_RIGHT,
        });
        super._init(params);

        const emojiCategoryList = new EmojiCategoryListWidget({
            categoryList: EmojiCategoryList,
        });
        this.add_named(emojiCategoryList, 'emojis');

        const letterCategoryList = new LetterCategoryListWidget({
            categoryList: LetterCategoryList,
        });
        this.add_named(letterCategoryList, 'letters');

        this.set_visible_child_name('emojis');

        this._categoryList = CategoryList.slice();

        this.connect('notify::visible-child-name',
                     Lang.bind(this, this._ensureTransitionType));
    }

    _ensureTransitionType() {
        if (this.get_visible_child_name() == 'emojis') {
            this.transition_type = Gtk.StackTransitionType.SLIDE_RIGHT;
        } else {
            this.transition_type = Gtk.StackTransitionType.SLIDE_LEFT;
        }
    }

    getCategoryList() {
        return this._categoryList;
    }
});
