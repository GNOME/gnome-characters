const Lang = imports.lang;
const Params = imports.params;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Cairo = imports.cairo;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;

const BASELINE_OFFSET = 0.15;
const CELL_SIZE = 0.20;
const CELLS_PER_ROW = 5;

const CharacterListRowWidget = new Lang.Class({
    Name: 'CharacterListRowWidget',
    Extends: Gtk.DrawingArea,

    _init: function(params, characters) {
        params = Params.fill(params, {});
        this.parent(params);
	this.characters = characters;
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
        description.set_size(90);
        layout.set_font_description(description);

        // Draw baseline.
        let distance = cr.deviceToUserDistance (1, 1);
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

    _init: function(params, characters) {
        params = Params.fill(params, { orientation: Gtk.Orientation.VERTICAL,
				       homogeneous: true });
        this.parent(params);
	this._setCharacters(characters);
    },

    vfunc_size_allocate: function(allocation) {
	this.parent(allocation);

	// Make each row have the same height.
	let children = this.get_children();
	for (let index in children)
	    children[index].set_size_request(allocation.width,
					     allocation.width * CELL_SIZE);
    },

    _setCharacters: function(characters) {
	if (characters.length == 0)
	    return;

        let start = 0, stop = 1;
        for (; stop < characters.length; stop++) {
            if (stop % CELLS_PER_ROW == 0) {
		let rowCharacters = characters.slice(start, stop);
		let rowWidget = new CharacterListRowWidget({}, rowCharacters);
		this.pack_start(rowWidget, true, true, 0);
                start = stop;
            }
        }
        if (stop % CELLS_PER_ROW != 0) {
	    let rowCharacters = characters.slice(start, stop);
	    let rowWidget = new CharacterListRowWidget({}, rowCharacters);
	    this.pack_start(rowWidget, true, true, 0);
        }
    },
});
