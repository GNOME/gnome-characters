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
        label: N_('Recently Used'),
        icon_name: 'document-open-recent-symbolic'
    },
    {
        name: 'punctuation',
        category: Gc.Category.PUNCTUATION,
        label: N_('Punctuation'),
        icon_name: 'characters-punctuation-symbolic'
    },
    {
        name: 'arrow',
        category: Gc.Category.ARROW,
        label: N_('Arrows'),
        icon_name: 'characters-arrow-symbolic'
    },
    {
        name: 'bullet',
        category: Gc.Category.BULLET,
        label: N_('Bullets'),
        icon_name: 'characters-bullet-symbolic'
    },
    {
        name: 'picture',
        category: Gc.Category.PICTURE,
        label: N_('Pictures'),
        icon_name: 'characters-picture-symbolic'
    },
    {
        name: 'currency',
        category: Gc.Category.CURRENCY,
        label: N_('Currencies'),
        icon_name: 'characters-currency-symbolic'
    },
    {
        name: 'math',
        category: Gc.Category.MATH,
        label: N_('Math'),
        icon_name: 'characters-math-symbolic'
    },
    {
        name: 'latin',
        category: Gc.Category.LATIN,
        label: N_('Latin'),
        icon_name: 'characters-latin-symbolic'
    },
    {
        name: 'emoticon',
        category: Gc.Category.EMOTICON,
        label: N_('Emoticons'),
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

        let label = new Gtk.Label({ label: Gettext.gettext(category.label),
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
