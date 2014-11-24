// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (C) 2014  Daiki Ueno <dueno@src.gnome.org>
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

const BASELINE_OFFSET = 0.85;
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
                                               font: null,
                                               cellWidth: null });
        params = Params.fill(params, {});
        this.parent(params);
        this._characters = filtered.characters;
        this._font = filtered.font;
        this._cellWidth = filtered.cellWidth;
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

    vfunc_size_allocate: function(allocation) {
        this.parent(allocation);

        if (this._cellWidth < 0)
            this._cellWidth = allocation.width * CELL_SIZE;
    },

    vfunc_button_press_event: function(event) {
        let allocation = this.get_allocation();
        let cellIndex = Math.floor(event.x / this._cellWidth);
        if (cellIndex < this._characters.length)
            this.emit('character-selected', this._characters[cellIndex]);
    },

    vfunc_draw: function(cr) {
        // Use device coordinates directly, since PangoCairo doesn't
        // work well with scaled matrix:
        // https://bugzilla.gnome.org/show_bug.cgi?id=700592
        let allocation = this.get_allocation();

        // Clear the canvas.
        // FIXME: Pick the background color from CSS.
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.paint();
        cr.setSourceRGBA(0, 0, 0, 1);

        let layout = PangoCairo.create_layout(cr);
        let description = Pango.FontDescription.from_string(this._font);
        description.set_absolute_size(this._cellWidth / 2 * Pango.SCALE);
        layout.set_font_description(description);

        // Draw baseline.
        // FIXME: Pick the baseline color from CSS.
        cr.setSourceRGBA(114.0 / 255.0, 159.0 / 255.0, 207.0 / 255.0, 1.0);
        cr.setLineWidth(0.5);
        cr.moveTo(0, BASELINE_OFFSET * allocation.height);
        cr.relLineTo(allocation.width, 0);
        cr.stroke();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);

        // Draw characters.  Do centering and attach to the baseline.
        for (let i in this._characters) {
            layout.set_text(this._characters[i], -1);
            let layoutBaseline = layout.get_baseline() / Pango.SCALE;
            let [logicalRect, inkRect] = layout.get_extents();
            cr.moveTo(this._cellWidth * i - logicalRect.x / Pango.SCALE +
                      (this._cellWidth - logicalRect.width / Pango.SCALE) / 2,
                      BASELINE_OFFSET * allocation.height - layoutBaseline);
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
        this._cellWidth = -1;
        this._cellsPerRow = CELLS_PER_ROW;
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

        if (this._cellWidth < 0)
            this._cellWidth = allocation.width * CELL_SIZE;

        // Reflow if the number of cells per row has changed.
        let cellsPerRow = Math.floor(allocation.width / this._cellWidth);
        if (cellsPerRow != this._cellsPerRow) {
            this._cellsPerRow = cellsPerRow;
            this.setCharacters(this._characters);
            this.show_all();
        }

        // Make each row have the same height.
        let rowHeight = this._cellWidth;
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
            font: this._font,
            cellWidth: this._cellWidth
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
            if (stop % this._cellsPerRow == 0) {
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
