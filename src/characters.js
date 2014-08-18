const Lang = imports.lang;
const Params = imports.params;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;
const Gc = imports.gi.Gc;

const BASELINE_OFFSET = 0.15;
const CELL_SIZE = 0.20;
const CELLS_PER_ROW = 5;
const FONT_PIXEL_SIZE = 90;
const CELL_PIXEL_SIZE = FONT_PIXEL_SIZE + 10;

const CharacterListRowWidget = new Lang.Class({
    Name: 'CharacterListRowWidget',
    Extends: Gtk.DrawingArea,
    Signals: {
	'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params, characters) {
        params = Params.fill(params, {});
        this.parent(params);
	this.characters = characters;
	this.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
    },

    vfunc_get_preferred_height: function() {
	let [minWidth, natWidth] = this.vfunc_get_preferred_width();
	return this.vfunc_get_preferred_height_for_width(minWidth);
    },

    vfunc_get_preferred_height_for_width: function(width) {
	let rowHeight = width * CELL_SIZE;
	return [rowHeight, rowHeight];
    },

    vfunc_get_preferred_width: function() {
	return this.vfunc_get_preferred_width_for_height(0);
    },

    vfunc_get_preferred_width_for_height: function(height) {
	let rowWidth = CELL_PIXEL_SIZE * CELLS_PER_ROW;
	return [rowWidth, rowWidth];
    },

    vfunc_button_press_event: function(event) {
	let allocation = this.get_allocation();
	let cell_width = allocation.width * CELL_SIZE;
	let cell_index = Math.floor(event.x / cell_width);
	if (cell_index < this.characters.length) {
	    this.selectedCharacter = this.characters[cell_index];
	    let dialog = this._createCharacterDialog();
	    switch (dialog.run()) {
	    case Gtk.ResponseType.HELP:
		print('not implemented');
		dialog.destroy();
		break;
	    case Gtk.ResponseType.CLOSE:
		dialog.destroy();
		break;
	    }
	    this.emit('character-selected', this.selectedCharacter);
	    this.selectedCharacter = null;
	}
    },

    _createCharacterDialog: function() {
        let builder = new Gtk.Builder();
        builder.add_from_resource('/org/gnome/Characters/character-dialog.ui');
        let characterLabel = builder.get_object('character-label');
	characterLabel.label = this.selectedCharacter;
        let detailLabel = builder.get_object('detail-label');
	let codePoint = this.selectedCharacter.charCodeAt(0);
	let codePointHex = codePoint.toString(16).toUpperCase();
	detailLabel.label = _("Unicode: U+%s".format(codePointHex));
	let copyCharacterButton = builder.get_object('copy-character-button');
	copyCharacterButton.connect('clicked',
				    Lang.bind(this, this._copyCharacter));
	let dialog = builder.get_object('character-dialog');
	dialog.transient_for = this.get_toplevel();
	let name = Gc.character_name(this.selectedCharacter);
	if (name != null) {
	    let headerBar = dialog.get_header_bar();
	    headerBar.set_title(name);
	}
	dialog.add_button(_("See also"), Gtk.ResponseType.HELP);
	dialog.add_button(_("Done"), Gtk.ResponseType.CLOSE);
	return dialog;
    },

    _copyCharacter: function() {
	// FIXME
	print('not implemented');

	// let atom = Gdk.atom_intern("CLIPBOARD", false);
	// let clipboard = Gtk.Clipboard.get(atom);
	// clipboard.set_text(this.selectedCharacter,
	// 		   this.selectedCharacter.length);
    },

    vfunc_draw: function(cr) {
	// Use [0.0, 1.0] coordinates.
        let extents = cr.clipExtents()
        cr.scale(extents[2], extents[2]);

	// Clear the canvas.
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.paint();
        cr.setSourceRGBA(0, 0, 0, 1);

        let layout = PangoCairo.create_layout(cr);
	// FIXME: Move this to settings
        let description = Pango.FontDescription.from_string("Cantarell");
        description.set_absolute_size(FONT_PIXEL_SIZE);
        layout.set_font_description(description);

        // Draw baseline.
        let distance = cr.deviceToUserDistance(1, 1);
        let px = Math.max(distance[0], distance[1]);

        cr.setSourceRGBA(0.0, 0.0, 1.0, 0.2);
        cr.setLineWidth(0.5 * px);
        cr.moveTo(0, BASELINE_OFFSET);
        cr.relLineTo(1.0, 0);
        cr.stroke();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);

        // Draw characters.  Do centering and attach to the baseline.
        for (let i in this.characters) {
            layout.set_text(this.characters[i], -1);
            let layout_baseline = layout.get_baseline() / Pango.SCALE;
            let [logical_rect, ink_rect] = layout.get_extents();
            cr.moveTo(CELL_SIZE * i - logical_rect.x / Pango.SCALE +
		      (CELL_SIZE - logical_rect.width / Pango.SCALE) / 2,
                      BASELINE_OFFSET - layout_baseline);
            PangoCairo.show_layout(cr, layout);
        }
    },
});

const CharacterListWidget = new Lang.Class({
    Name: 'CharacterListWidget',
    Extends: Gtk.Box,
    Signals: {
	'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params, characters) {
        params = Params.fill(params, { orientation: Gtk.Orientation.VERTICAL,
				       homogeneous: true });
        this.parent(params);
	this.setCharacters(characters);
    },

    vfunc_get_preferred_height: function() {
	let [minWidth, natWidth] = this.vfunc_get_preferred_width();
	return this.vfunc_get_preferred_height_for_width(minWidth);
    },

    vfunc_get_preferred_height_for_width: function(width) {
	let height = 0;
	let children = this.get_children();
	for (let index in children) {
	    let [minHeight, natHeight] =
		children[index].get_preferred_height_for_width(width);
	    height += minHeight;
	}
	return [height, height];
    },

    vfunc_get_preferred_width: function() {
	return this.vfunc_get_preferred_width_for_height(0);
    },

    vfunc_get_preferred_width_for_height: function(height) {
	let width = 0;
	let children = this.get_children();
	for (let index in children) {
	    let [minWidth, natWidth] =
		children[index].get_preferred_width_for_height(height);
	    width = Math.max(width, minWidth);
	}
	return [width, width];
    },

    vfunc_size_allocate: function(allocation) {
	this.parent(allocation);

	// Make each row have the same height.
	let rowHeight = allocation.width * CELL_SIZE;
	let children = this.get_children();
	for (let index in children) {
	    let child = children[index];
	    var childAllocation = child.get_allocation();
	    childAllocation.x = allocation.x;
	    childAllocation.y = allocation.y + rowHeight * index;
	    childAllocation.width = allocation.width;
	    childAllocation.height = rowHeight;
	    child.size_allocate(childAllocation);
	}
    },

    setCharacters: function(characters) {
	let children = this.get_children();
	for (let index in children)
	    this.remove(children[index]);

	if (characters.length == 0)
	    return;

        let start = 0, stop = 1;
        for (; stop < characters.length; stop++) {
            if (stop % CELLS_PER_ROW == 0) {
		let rowCharacters = characters.slice(start, stop);
		let rowWidget = new CharacterListRowWidget({}, rowCharacters);
		rowWidget.connect('character-selected',
				  Lang.bind(this, function(row, uc) {
				      this.emit('character-selected', uc);
				  }));
		this.pack_start(rowWidget, true, true, 0);
                start = stop;
            }
        }
        if (stop % CELLS_PER_ROW != 0) {
	    let rowCharacters = characters.slice(start, stop);
	    let rowWidget = new CharacterListRowWidget({}, rowCharacters);
	    rowWidget.connect('character-selected',
			      Lang.bind(this, function(row, uc) {
				  this.emit('character-selected', uc);
			      }));
	    this.pack_start(rowWidget, true, true, 0);
        }
    },
});
