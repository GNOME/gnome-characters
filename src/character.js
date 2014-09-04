const Lang = imports.lang;
const Params = imports.params;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const Gc = imports.gi.Gc;
const Main = imports.main;
const Util = imports.util;

const CharacterDialog = new Lang.Class({
    Name: 'CharacterDialog',
    Extends: Gtk.Dialog,
    Properties: {
	'font': GObject.ParamSpec.string(
	    'font', '', '',
	    GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
	    'Cantarell')
    },

    get font() {
	return this._font;
    },

    set font(v) {
	if (v == this._font)
	    return;

	this._font = v;
        let description = Pango.FontDescription.from_string(this._font);
        this._characterLabel.override_font(description);

	let children = this._relatedList.get_children();
	for (let index in children) {
	    let label = children[index].get_children()[0];
	    label.override_font(description);
	}
    },

    _init: function(params) {
        let filtered = Params.filter(params, { character: null });
        params = Params.fill(params, { use_header_bar: true,
				       width_request: 400,
				       height_request: 400 });
        this.parent(params);

	this._cancellable = new Gio.Cancellable();

        let builder = new Gtk.Builder();
        builder.add_from_resource('/org/gnome/Characters/character.ui');
	this._stack = builder.get_object('main-stack')
        this.get_content_area().add(this._stack);

        this._characterLabel = builder.get_object('character-label');
        this._detailLabel = builder.get_object('detail-label');

        let copyButton = builder.get_object('copy-button');
        copyButton.connect('clicked', Lang.bind(this, this._copyCharacter));

	this._relatedList = builder.get_object('related-listbox');
	this._relatedList.connect('row-selected',
				  Lang.bind(this, this._handleRowSelected));

        this._doneButton = this.add_button(_("Done"), Gtk.ResponseType.CLOSE);
        this._doneButton.get_style_context().add_class(
	    Gtk.STYLE_CLASS_SUGGESTED_ACTION);

	this._relatedButton = new Gtk.ToggleButton({ label: _("See also") });
	this.add_action_widget(this._relatedButton, Gtk.ResponseType.HELP);
	this._relatedButton.show();

	this._relatedButton.connect(
	    'toggled',
	    Lang.bind(this, function() {
		if (this._stack.visible_child_name == 'character')
		    this._stack.visible_child_name = 'related';
		else
		    this._stack.visible_child_name = 'character';
	    }));

	Main.settings.bind('font', this, 'font',
			   Gio.SettingsBindFlags.DEFAULT);

	this._setCharacter(filtered.character);
    },

    _finishSearch: function(result) {
        for (let index = 0; index < result.len; index++) {
	    let uc = Gc.search_result_get(result, index);
	    let name = Gc.character_name(uc);
	    if (name == null)
		continue;

	    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });

	    let characterLabel = new Gtk.Label({ label: uc,
						 valign: Gtk.Align.CENTER,
						 halign: Gtk.Align.CENTER,
						 width_request: 45 });
	    characterLabel.get_style_context().add_class('character');
	    hbox.pack_start(characterLabel, false, false, 2);

	    let nameLabel = new Gtk.Label({ label: Util.capitalize(name),
					    halign: Gtk.Align.START });
	    hbox.pack_start(nameLabel, true, true, 0);

	    let row = new Gtk.ListBoxRow();
	    row._character = uc;
	    row.add(hbox);
	    row.show_all();

	    this._relatedList.add(row);
	}

	this._relatedButton.visible =
	    this._relatedList.get_children().length > 0;
    },

    _setCharacter: function(uc) {
	this._character = uc;

        this._character = this._character;
        this._characterLabel.label = this._character;

        let codePoint = this._character.charCodeAt(0);
        let codePointHex = codePoint.toString(16).toUpperCase();
        this._detailLabel.label = _("Unicode U+%04s").format(codePointHex);

        let children = this._relatedList.get_children();
        for (let index in children)
            this._relatedList.remove(children[index]);

	this._cancellable.cancel();
	this._cancellable.reset();
	Gc.search_related(
	    this._character,
            -1,
	    this._cancellable,
	    Lang.bind(this, function(source_object, res, user_data) {
		try {
		    let result = Gc.search_finish(res);
		    this._finishSearch(result);
		} catch (e) {
                    log("Failed to search related: " + e);
		}
	    }));

	this._relatedButton.active = false;
	this._stack.visible_child_name = 'character';
	this._stack.show_all();

        let headerBar = this.get_header_bar();
        let name = Gc.character_name(this._character);
        if (name != null)
            headerBar.title = Util.capitalize(name);
    },

    _copyCharacter: function() {
        let clipboard = Gc.gtk_clipboard_get();
        // FIXME: GLib.unichar_to_utf8() has missing (nullable)
        // annotation to the outbuf argument.
        let outbuf = '      ';
        let length = GLib.unichar_to_utf8(this._character, outbuf);
        clipboard.set_text(this._character, length);
    },

    _handleRowSelected: function(listBox, row) {
        if (row != null) {
	    this._setCharacter(row._character);
            let toplevel = this.get_transient_for();
            let action = toplevel.lookup_action('character');
            action.activate(new GLib.Variant('s', row._character));
	}
    },
});
