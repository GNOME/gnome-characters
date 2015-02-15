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
const CELLS_PER_ROW = 5;
const NUM_ROWS = 10;
const CELL_SIZE = 50;

function getCellSize(fontDescription) {
    if (fontDescription == null
        || fontDescription.get_size() == 0)
        return CELL_SIZE;
    return fontDescription.get_size() * 2 / Pango.SCALE;
}

const CharacterListRow = new Lang.Class({
    Name: 'CharacterListRow',
    Extends: GObject.Object,

    _init: function(params) {
        let filtered = Params.filter(params, { characters: null,
                                               fontDescription: null });
        params = Params.fill(params, {});
        this.parent(params);
        this._characters = filtered.characters;
        this._fontDescription = filtered.fontDescription;
    },

    draw: function(cr, x, y, width, height) {
        let layout = PangoCairo.create_layout(cr);
        layout.set_font_description(this._fontDescription);

        // Draw baseline.
        // FIXME: Pick the baseline color from CSS.
        cr.setSourceRGBA(114.0 / 255.0, 159.0 / 255.0, 207.0 / 255.0, 1.0);
        cr.setLineWidth(0.5);
        cr.moveTo(x, y + BASELINE_OFFSET * height);
        cr.relLineTo(width, 0);
        cr.stroke();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);

        // Draw characters.  Do centering and attach to the baseline.
        let cellSize = getCellSize(this._fontDescription);
        for (let i in this._characters) {
            layout.set_text(this._characters[i], -1);
            let layoutBaseline = layout.get_baseline() / Pango.SCALE;
            let [logicalRect, inkRect] = layout.get_extents();
            cr.moveTo(x + cellSize * i - logicalRect.x / Pango.SCALE +
                      (cellSize - logicalRect.width / Pango.SCALE) / 2,
                      y + BASELINE_OFFSET * height - layoutBaseline);
            PangoCairo.show_layout(cr, layout);
        }
    },
});

const CharacterListWidget = new Lang.Class({
    Name: 'CharacterListWidget',
    Extends: Gtk.DrawingArea,
    Signals: {
        'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params) {
        let filtered = Params.filter(params, { fontDescription: null });
        params = Params.fill(params, {});
        this.parent(params);
        this.get_style_context().add_class('character-list');
        this._cellsPerRow = CELLS_PER_ROW;
        this._fontDescription = filtered.fontDescription;
        this._characters = [];
        this._rows = [];
        this.add_events(Gdk.EventMask.BUTTON_PRESS_MASK);
    },

    vfunc_button_press_event: function(event) {
        let allocation = this.get_allocation();
        let cellSize = getCellSize(this._fontDescription);
        let x = Math.floor(event.x / cellSize);
        let y = Math.floor(event.y / cellSize);
        let index = y * this._cellsPerRow + x;
        if (index < this._characters.length)
            this.emit('character-selected', this._characters[index]);
    },

    vfunc_get_preferred_height: function() {
        let [minWidth, natWidth] = this.vfunc_get_preferred_width();
        return this.vfunc_get_preferred_height_for_width(minWidth);
    },

    vfunc_get_preferred_height_for_width: function(width) {
        let height = Math.max(this._rows.length, NUM_ROWS) * getCellSize(this._fontDescription);
        return [height, height];
    },

    vfunc_get_preferred_width: function() {
        return this.vfunc_get_preferred_width_for_height(0);
    },

    vfunc_get_preferred_width_for_height: function(height) {
        let width = this._cellsPerRow * getCellSize(this._fontDescription);
        return [width, width];
    },

    vfunc_size_allocate: function(allocation) {
        this.parent(allocation);

        let cellSize = getCellSize(this._fontDescription);
        let cellsPerRow = Math.floor(allocation.width / cellSize);
        if (cellsPerRow != this._cellsPerRow) {
            // Reflow if the number of cells per row has changed.
            this._cellsPerRow = cellsPerRow;
            this.setCharacters(this._characters);
        }
    },

    _createCharacterListRow: function(characters) {
        let row = new CharacterListRow({
            characters: characters,
            fontDescription: this._fontDescription
        });
        return row;
    },

    setFontDescription: function(fontDescription) {
        this._fontDescription = fontDescription;
    },

    setCharacters: function(characters) {
        this._rows = [];
        this._characters = characters;

        let start = 0, stop = 1;
        for (; stop <= characters.length; stop++) {
            if (stop % this._cellsPerRow == 0) {
                let rowCharacters = characters.slice(start, stop);
                let row = this._createCharacterListRow(rowCharacters);
                this._rows.push(row);
                start = stop;
            }
        }
        if (start != stop - 1) {
            let rowCharacters = characters.slice(start, stop);
            let row = this._createCharacterListRow(rowCharacters);
            this._rows.push(row);
        }

        this.queue_draw();
    },

    vfunc_draw: function(cr) {
        // Clear the canvas.
        let context = this.get_style_context();
        let fg = context.get_color(Gtk.StateFlags.NORMAL);
        let bg = context.get_background_color(Gtk.StateFlags.NORMAL);

        cr.setSourceRGBA(bg.red, bg.green, bg.blue, bg.alpha);
        cr.paint();
        cr.setSourceRGBA(fg.red, fg.green, fg.blue, fg.alpha);

        // Use device coordinates directly, since PangoCairo doesn't
        // work well with scaled matrix:
        // https://bugzilla.gnome.org/show_bug.cgi?id=700592
        let allocation = this.get_allocation();

        // Redraw rows within the clipped region.
        let [x1, y1, x2, y2] = cr.clipExtents();
        let cellSize = getCellSize(this._fontDescription);
        let start = Math.max(0, Math.floor(y1 / cellSize));
        let end = Math.min(this._rows.length, Math.ceil(y2 / cellSize));
        for (let index = start; index < end; index++) {
            this._rows[index].draw(cr, 0, index * cellSize,
                                   allocation.width, cellSize);
        }
    }
});

const MAX_SEARCH_RESULTS = 100;

const CharacterListView = new Lang.Class({
    Name: 'CharacterListView',
    Extends: Gtk.Stack,
    Template: 'resource:///org/gnome/Characters/characterlist.ui',
    InternalChildren: ['loading-spinner'],
    Properties: {
        'font': GObject.ParamSpec.string(
            'font', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            'Cantarell 50')
    },

    get font() {
        return this._font;
    },

    set font(v) {
        let fontDescription = Pango.FontDescription.from_string(v);
        if (fontDescription.get_size() == 0)
            fontDescription.set_size(CELL_SIZE * Pango.SCALE);

        if (this._fontDescription &&
            fontDescription.equal(this._fontDescription))
            return;

        this._font = v;
        this._fontDescription = fontDescription;
        if (this.mapped) {
            this.setCharacters(this._characters);
            this.show_all();
        }
    },

    _init: function(params) {
        params = Params.fill(params, { hexpand: true, vexpand: true });
        this.parent(params);

        Main.settings.bind('font', this, 'font', Gio.SettingsBindFlags.DEFAULT);

        this._characterList = new CharacterListWidget({ hexpand: true,
                                                        vexpand: true,
                                                        fontDescription: this._fontDescription });
        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER
        });
        scroll.add(this._characterList);
        this.add_named(scroll, 'character-list');

        this._characters = [];
        this._spinnerTimeoutId = 0;
        this._cancellable = new Gio.Cancellable();
    },

    _stopSpinner: function() {
        if (this._spinnerTimeoutId > 0) {
            GLib.source_remove(this._spinnerTimeoutId);
            this._spinnerTimeoutId = 0;
            this._loading_spinner.stop();
        }
        this._cancellable.reset();
    },

    _startSearch: function() {
        this._cancellable.cancel();
        this._stopSpinner();

        this._spinnerTimeoutId =
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000,
                             Lang.bind(this, function () {
                                 this._loading_spinner.start();
                                 this.visible_child_name = 'loading';
                                 this.show_all();
                             }));
    },

    _finishSearch: function(result) {
        this._stopSpinner();

        let characters = [];
        for (let index = 0; index < result.len; index++) {
            characters.push(Gc.search_result_get(result, index));
        }

        this._characters = characters;
        this.updateCharacterList()
    },

    setCharacters: function(characters) {
        this._characters = characters;
    },

    updateCharacterList: function() {
        let characters = this._characters;
        let fontDescription = this._fontDescription;
        if (this._filterFontDescription) {
            let context = this.get_pango_context();
            let filterFont = context.load_font(this._filterFontDescription);
            let filteredCharacters = [];
            for (let index = 0; index < characters.length; index++) {
                let uc = characters[index];
                if (Gc.pango_context_font_has_glyph(context, filterFont, uc))
                    filteredCharacters.push(uc);
            }
            characters = filteredCharacters;
            fontDescription = this._filterFontDescription;
        }

        this._characterList.setFontDescription(fontDescription);
        this._characterList.setCharacters(characters);
        if (characters.length == 0) {
            this.visible_child_name = 'unavailable';
        } else {
            this.visible_child_name = 'character-list';
        }
        this.show_all();
    },

    searchByCategory: function(category) {
        this._startSearch()
        Gc.search_by_category(
            category.category,
            -1,
            this._cancellable,
            Lang.bind(this,
                      function(source_object, res, user_data) {
                          try {
                              let result = Gc.search_finish(res);
                              this._finishSearch(result);
                          } catch (e) {
                              log("Failed to search by category: " + e);
                          }
                      }));
    },

    searchByKeywords: function(keywords) {
        this._startSearch()
        Gc.search_by_keywords(
            keywords,
            MAX_SEARCH_RESULTS,
            this._cancellable,
            Lang.bind(this, function(source_object, res, user_data) {
                try {
                    let result = Gc.search_finish(res);
                    this._finishSearch(result);
                } catch (e) {
                    log("Failed to search by keywords: " + e);
                }
            }));
    },

    cancelSearch: function() {
        this._cancellable.cancel();
        this._finishSearch([]);
    },

    setFilterFont: function(family) {
        let fontDescription;
        if (family == null) {
            fontDescription = null;
        } else {
            fontDescription = Pango.FontDescription.from_string(family);
            fontDescription.set_size(this._fontDescription.get_size());
        }

        if ((this._filterFontDescription != null && fontDescription == null) ||
            (this._filterFontDescription == null && fontDescription != null) ||
            (this._filterFontDescription != null && fontDescription != null &&
             !fontDescription.equal(this._filterFontDescription))) {
            this._filterFontDescription = fontDescription;
            this.updateCharacterList();
        }
    }
});
