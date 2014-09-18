const Lang = imports.lang;
const Params = imports.params;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;
const Gc = imports.gi.Gc;
const Main = imports.main;
const Util = imports.util;

const BASELINE_OFFSET = 0.15;
const CELL_SIZE = 0.20;
const CELLS_PER_ROW = 5;
const CELL_PIXEL_SIZE = 100;

const CharacterListRowWidget = new Lang.Class({
    Name: 'CharacterListRowWidget',
    Extends: Gtk.DrawingArea,
    Signals: {
        'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params) {
	let filtered = Params.filter(params, { characters: null,
					       font: null });
        params = Params.fill(params, {});
        this.parent(params);
        this._characters = filtered.characters;
        this._font = filtered.font;
        this.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
        this.get_style_context().add_class('character-list-row');
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
        if (cell_index < this._characters.length)
            this.emit('character-selected', this._characters[cell_index]);
    },

    vfunc_draw: function(cr) {
	// Use device coordinates directly, since PangoCairo doesn't
	// work well with scaled matrix:
	// https://bugzilla.gnome.org/show_bug.cgi?id=700592
        let allocation = this.get_allocation();
        let cell_pixel_size = allocation.width * CELL_SIZE;

        // Clear the canvas.
        // FIXME: Pick the background color from CSS.
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.paint();
        cr.setSourceRGBA(0, 0, 0, 1);

        let layout = PangoCairo.create_layout(cr);
        let description = Pango.FontDescription.from_string(this._font);
        description.set_absolute_size(cell_pixel_size / 2 * Pango.SCALE);
        layout.set_font_description(description);

        // Draw baseline.
        // FIXME: Pick the baseline color from CSS.
        cr.setSourceRGBA(114.0 / 255.0, 159.0 / 255.0, 207.0 / 255.0, 1.0);
        cr.setLineWidth(0.5);
        cr.moveTo(0, BASELINE_OFFSET * allocation.width);
        cr.relLineTo(allocation.width, 0);
        cr.stroke();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);

        // Draw characters.  Do centering and attach to the baseline.
        for (let i in this._characters) {
            layout.set_text(this._characters[i], -1);
            let layout_baseline = layout.get_baseline() / Pango.SCALE;
            let [logical_rect, ink_rect] = layout.get_extents();
            cr.moveTo(cell_pixel_size * i - logical_rect.x / Pango.SCALE +
                      (cell_pixel_size - logical_rect.width / Pango.SCALE) / 2,
                      BASELINE_OFFSET * allocation.width - layout_baseline);
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
	if (this._characters) {
	    this.setCharacters(this._characters);
	    this.show_all();
	}
    },

    _init: function(params) {
        params = Params.fill(params, { orientation: Gtk.Orientation.VERTICAL,
                                       homogeneous: true });
        this.parent(params);
        this.get_style_context().add_class('character-list');
        Main.settings.bind('font', this, 'font', Gio.SettingsBindFlags.DEFAULT);
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
        if (children.length == 0)
            width = CELL_PIXEL_SIZE * CELLS_PER_ROW;
        else {
            for (let index in children) {
                let [minWidth, natWidth] =
                    children[index].get_preferred_width_for_height(height);
                width = Math.max(width, minWidth);
            }
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

    _createCharacterListRow: function(characters) {
        let rowWidget = new CharacterListRowWidget({
	    characters: characters,
	    font: this._font
	});
        rowWidget.connect('character-selected',
                          Lang.bind(this, function(row, uc) {
                              this.emit('character-selected', uc);
                          }));
	return rowWidget;
    },

    setCharacters: function(characters) {
        let children = this.get_children();
        for (let index in children)
            this.remove(children[index]);

	this._characters = characters;

        if (characters.length == 0)
            return;

        let start = 0, stop = 1;
        for (; stop <= characters.length; stop++) {
            if (stop % CELLS_PER_ROW == 0) {
                let rowCharacters = characters.slice(start, stop);
                let rowWidget = this._createCharacterListRow(rowCharacters);
		this.pack_start(rowWidget, true, true, 0);
                start = stop;
            }
        }
        if (start != stop - 1) {
            let rowCharacters = characters.slice(start, stop);
            let rowWidget = this._createCharacterListRow(rowCharacters);
            this.pack_start(rowWidget, true, true, 0);
        }
    },
});
