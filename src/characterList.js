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
const Cairo = imports.cairo;
const Pango = imports.gi.Pango;
const PangoCairo = imports.gi.PangoCairo;
const Gc = imports.gi.Gc;
const Main = imports.main;
const Util = imports.util;

const BASELINE_OFFSET = 0.85;
const CELLS_PER_ROW = 5;
const NUM_ROWS = 5;
const NUM_COLUMNS = 5;
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
                                               fontDescription: null,
                                               overlayFontDescription: null });
        params = Params.fill(params, {});
        this.parent(params);
        this._characters = filtered.characters;
        this._fontDescription = filtered.fontDescription;
        this._overlayFontDescription = filtered.overlayFontDescription;
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
            var cellRect = new Gdk.Rectangle({ x: x + cellSize * i,
                                               y: y,
                                               width: cellSize,
                                               height: cellSize });
            if (Gc.character_is_invisible(this._characters[i])) {
                this._drawBoundingBox(cr, cellRect, this._characters[i]);
                this._drawCharacterName(cr, cellRect, this._characters[i]);
            } else {
                layout.set_text(this._characters[i], -1);
                if (layout.get_unknown_glyphs_count () == 0) {
                    let layoutBaseline = layout.get_baseline();
                    let [logicalRect, inkRect] = layout.get_extents();
                    cr.moveTo(x + cellSize * i - logicalRect.x / Pango.SCALE +
                              (cellSize - logicalRect.width / Pango.SCALE) / 2,
                              y + BASELINE_OFFSET * height -
                              layoutBaseline / Pango.SCALE);
                    PangoCairo.show_layout(cr, layout);
                } else {
                    this._drawBoundingBox(cr, cellRect, this._characters[i]);
                    this._drawCharacterName(cr, cellRect, this._characters[i]);
                }
            }
        }
    },

    _computeBoundingBox: function(cr, cellRect, uc) {
        let layout = PangoCairo.create_layout(cr);
        layout.set_font_description(this._fontDescription);
        layout.set_text(uc, -1);

        let shapeRect;
        let layoutBaseline;
        if (layout.get_unknown_glyphs_count() == 0) {
            let [logicalRect, inkRect] = layout.get_extents();
            layoutBaseline = layout.get_baseline();
            shapeRect = inkRect;
        } else {
            // If the character cannot be rendered with the current
            // font settings, show a rectangle calculated from the
            // base glyph ('A').
            if (this._baseGlyphRect == null) {
                layout.set_text('A', -1);
                let [baseLogicalRect, baseInkRect] = layout.get_extents();
                this._baseGlyphLayoutBaseline = layout.get_baseline();
                this._baseGlyphRect = baseInkRect;
            }
            layoutBaseline = this._baseGlyphLayoutBaseline;
            shapeRect = new Pango.Rectangle({
                x: this._baseGlyphRect.x,
                y: this._baseGlyphRect.y,
                width: this._baseGlyphRect.width,
                height: this._baseGlyphRect.height
            });
            let characterWidth = Gc.character_width (uc);
            if (characterWidth > 1)
                shapeRect.width *= characterWidth;
        }

        shapeRect.x = cellRect.x - shapeRect.x / Pango.SCALE +
            (cellRect.width - shapeRect.width / Pango.SCALE) / 2;
        shapeRect.y = cellRect.y + BASELINE_OFFSET * cellRect.height -
            layoutBaseline / Pango.SCALE;
        shapeRect.width = shapeRect.width / Pango.SCALE;
        shapeRect.height = shapeRect.height / Pango.SCALE;
        return shapeRect;
    },

    _drawBoundingBox: function(cr, cellRect, uc) {
        cr.save();
        cr.rectangle(cellRect.x, cellRect.y, cellRect.width, cellRect.height);
        cr.clip();

        let layout = PangoCairo.create_layout(cr);
        layout.set_font_description(this._fontDescription);
        layout.set_text(uc, -1);
        let shapeRect = this._computeBoundingBox(cr, cellRect, uc);

        let borderWidth = 1;
        cr.rectangle(shapeRect.x - borderWidth * 2,
                     shapeRect.y - borderWidth * 2,
                     shapeRect.width + borderWidth * 2,
                     shapeRect.height + borderWidth * 2);
        cr.setSourceRGBA(239.0 / 255.0, 239.0 / 255.0, 239.0 / 255.0, 1.0);
        cr.fill();

        cr.restore();
    },

    _drawCharacterName: function(cr, cellRect, uc) {
        cr.save();
        cr.rectangle(cellRect.x, cellRect.y, cellRect.width, cellRect.height);
        cr.clip();

        let layout = PangoCairo.create_layout(cr);
        layout.set_width(cellRect.width * Pango.SCALE * 0.8);
        layout.set_height(cellRect.height * Pango.SCALE * 0.8);
        layout.set_wrap(Pango.WrapMode.WORD);
        layout.set_ellipsize(Pango.EllipsizeMode.END);
        layout.set_alignment(Pango.Alignment.CENTER);
        layout.set_font_description(this._overlayFontDescription);
        let name = Gc.character_name(uc);
        let text = name == null ? _('Unassigned') : Util.capitalize(name);
        layout.set_text(text, -1);
        let [logicalRect, inkRect] = layout.get_extents();
        cr.moveTo(cellRect.x - logicalRect.x / Pango.SCALE +
                  (cellRect.width - logicalRect.width / Pango.SCALE) / 2,
                  cellRect.y - logicalRect.y / Pango.SCALE +
                  (cellRect.height - logicalRect.height / Pango.SCALE) / 2);
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);
        PangoCairo.show_layout(cr, layout);

        cr.restore();
    }
});

const CharacterListWidget = new Lang.Class({
    Name: 'CharacterListWidget',
    Extends: Gtk.DrawingArea,
    Signals: {
        'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params) {
        let filtered = Params.filter(params, {
            fontDescription: null,
            numRows: NUM_ROWS
        });
        params = Params.fill(params, {});
        this.parent(params);
        let context = this.get_style_context();
        context.add_class('character-list');
        context.save();
        this._cellsPerRow = CELLS_PER_ROW;
        this._fontDescription = filtered.fontDescription;
        this._numRows = filtered.numRows;
        this._characters = [];
        this._rows = [];
        this.add_events(Gdk.EventMask.BUTTON_PRESS_MASK |
                        Gdk.EventMask.BUTTON_RELEASE_MASK);
        this._character = null;
        this.drag_source_set(Gdk.ModifierType.BUTTON1_MASK,
                             null,
                             Gdk.DragAction.COPY);
        this.drag_source_add_text_targets();
    },

    vfunc_drag_begin: function(context) {
        let cellSize = getCellSize(this._fontDescription);
        this._dragSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32,
                                                   cellSize,
                                                   cellSize);
        let cr = new Cairo.Context(this._dragSurface);
        cr.setSourceRGBA(1.0, 1.0, 1.0, 1.0);
        cr.paint();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);
        let row = this._createCharacterListRow([this._character]);
        row.draw(cr, 0, 0, cellSize, cellSize);
        Gtk.drag_set_icon_surface(context, this._dragSurface, 0, 0);
    },

    vfunc_drag_data_get: function(context, data, info, time) {
        if (this._character != null)
            data.set_text(this._character, -1);
    },

    vfunc_button_press_event: function(event) {
        let allocation = this.get_allocation();
        let cellSize = getCellSize(this._fontDescription);
        let x = Math.floor(event.x / cellSize);
        let y = Math.floor(event.y / cellSize);
        let index = y * this._cellsPerRow + x;
        if (index < this._characters.length)
            this._character = this._characters[index];
        else
            this._character = null;
        return false;
    },

    vfunc_button_release_event: function(event) {
        if (this._character)
            this.emit('character-selected', this._character);
        return false;
    },

    vfunc_get_request_mode: function() {
        return Gtk.SizeRequestMode.HEIGHT_FOR_WIDTH;
    },

    vfunc_get_preferred_height: function() {
        let [minWidth, natWidth] = this.vfunc_get_preferred_width();
        return this.vfunc_get_preferred_height_for_width(minWidth);
    },

    vfunc_get_preferred_height_for_width: function(width) {
        let height = Math.max(this._rows.length, this._numRows) *
            getCellSize(this._fontDescription);
        return [height, height];
    },

    vfunc_get_preferred_width: function() {
        return this.vfunc_get_preferred_width_for_height(0);
    },

    vfunc_get_preferred_width_for_height: function(height) {
        let cellSize = getCellSize(this._fontDescription);
        let minWidth = NUM_COLUMNS * cellSize;
        let natWidth = Math.max(this._cellsPerRow, NUM_COLUMNS) * cellSize;
        return [minWidth, natWidth];
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
        var context = this.get_pango_context();
        var fontDescription = context.get_font_description();
        fontDescription.set_size(fontDescription.get_size() * 0.8);
        let row = new CharacterListRow({
            characters: characters,
            fontDescription: this._fontDescription,
            overlayFontDescription: fontDescription
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

        this.queue_resize();
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

var FontFilter = new Lang.Class({
    Name: 'FontFilter',
    Extends: GObject.Object,
    Properties: {
        'font': GObject.ParamSpec.string(
            'font', '', '',
            GObject.ParamFlags.READABLE | GObject.ParamFlags.WRITABLE,
            'Cantarell 50')
    },
    Signals: {
        'filter-set': { param_types: [] }
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
    },

    get fontDescription() {
        if (this._filterFontDescription)
            return this._filterFontDescription;
        return this._fontDescription;
    },

    _init: function(params) {
        params = Params.fill(params, {});
        this.parent(params);

        this._fontDescription = null;
        this._filterFontDescription = null;

        Main.settings.bind('font', this, 'font', Gio.SettingsBindFlags.DEFAULT);
    },

    setFilterFont: function(v) {
        let fontDescription;
        if (v == null) {
            fontDescription = null;
        } else {
            fontDescription = Pango.FontDescription.from_string(v);
            fontDescription.set_size(this._fontDescription.get_size());
        }

        if ((this._filterFontDescription != null && fontDescription == null) ||
            (this._filterFontDescription == null && fontDescription != null) ||
            (this._filterFontDescription != null && fontDescription != null &&
             !fontDescription.equal(this._filterFontDescription))) {
            this._filterFontDescription = fontDescription;
            this.emit('filter-set');
        }
    },

    apply: function(widget, characters) {
        let fontDescription = this._fontDescription;
        if (this._filterFontDescription) {
            let context = widget.get_pango_context();
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

        return [fontDescription, characters];
    },
});

var CharacterListView = new Lang.Class({
    Name: 'CharacterListView',
    Extends: Gtk.Stack,
    Template: 'resource:///org/gnome/Characters/characterlist.ui',
    InternalChildren: ['loading-spinner'],
    Signals: {
        'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params) {
        let filtered = Params.filter(params, {
            fontFilter: null
        });
        params = Params.fill(params, {
            hexpand: true, vexpand: true,
            transition_type: Gtk.StackTransitionType.CROSSFADE
        });
        this.parent(params);

        this._fontFilter = filtered.fontFilter;
        this._characterList = new CharacterListWidget({
            hexpand: true,
            vexpand: true,
            fontDescription: this._fontFilter.fontDescription
        });
        this._characterList.connect('character-selected',
                                    Lang.bind(this, function(w, c) {
                                        this.emit('character-selected', c);
                                    }));
        let scroll = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            visible: true
        });
        scroll.add(this._characterList);
        let context = scroll.get_style_context();
        context.add_class('character-list-scroll');
        context.save();
        this.add_named(scroll, 'character-list');
        this.visible_child_name = 'character-list';

        this._fontFilter.connect('filter-set',
                                 Lang.bind(this, this._updateCharacterList));

        this._characters = [];
        this._spinnerTimeoutId = 0;
        this._searchContext = null;
        this._cancellable = new Gio.Cancellable();
        this._cancellable.connect(Lang.bind(this, function () {
            this._stopSpinner();
            this._searchContext = null;
            this._characters = [];
            this._updateCharacterList();
        }));
        scroll.connect('edge-reached', Lang.bind(this, this._onEdgeReached));
        scroll.connect('size-allocate', Lang.bind(this, this._onSizeAllocate));
    },

    _startSpinner: function() {
        this._stopSpinner();
        this._spinnerTimeoutId =
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000,
                             Lang.bind(this, function () {
                                 this._loading_spinner.start();
                                 this.visible_child_name = 'loading';
                                 this.show_all();
                             }));
    },

    _stopSpinner: function() {
        if (this._spinnerTimeoutId > 0) {
            GLib.source_remove(this._spinnerTimeoutId);
            this._spinnerTimeoutId = 0;
            this._loading_spinner.stop();
        }
    },

    _finishSearch: function(result) {
        this._stopSpinner();

        let characters = Util.searchResultToArray(result);

        this.setCharacters(characters);
    },

    setCharacters: function(characters) {
        this._characters = characters;
        this._updateCharacterList();
    },

    _updateCharacterList: function() {
        let [fontDescription, characters] = this._fontFilter.apply(this, this._characters);
        this._characterList.setFontDescription(fontDescription);
        this._characterList.setCharacters(characters);
        if (characters.length == 0) {
            this.visible_child_name = 'unavailable';
        } else {
            this.visible_child_name = 'character-list';
        }
        this.show_all();
    },

    _maybeLoadMore() {
        if (this._searchContext != null && !this._searchContext.is_finished()) {
            this._searchWithContext(this._searchContext, MAX_SEARCH_RESULTS);
        }
    },

    _onEdgeReached: function(scrolled, pos) {
        if (pos == Gtk.PositionType.BOTTOM) {
            this._maybeLoadMore();
        }
    },

    get initialSearchCount() {
        // Use our parents allocation; we aren't visible before we do the
        // initial search, so our allocation is 1x1
        let allocation = this.get_parent().get_allocation();

        // Sometimes more MAX_SEARCH_RESULTS are visible on screen
        // (eg. fullscreen at 1080p).  We always present a over-full screen,
        // otherwise the lazy loading gets broken
        let cellSize = getCellSize(this._fontFilter.fontDescription);
        let cellsPerRow = Math.floor(allocation.width / cellSize);
        // Ensure the rows cause a scroll
        let heightInRows = Math.ceil((allocation.height + 1) / cellSize);

        return Math.max(MAX_SEARCH_RESULTS, heightInRows * cellsPerRow);
    },

    _onSizeAllocate: function(scrolled, allocation) {
        if (this._characters.length < this.initialSearchCount) {
            this._maybeLoadMore();
        }
    },

    _addSearchResult: function(result) {
        let characters = Util.searchResultToArray(result);
        this.setCharacters(this._characters.concat(characters));
    },

    _searchWithContext: function(context, count) {
        this._startSpinner();
        context.search(
            count,
            this._cancellable,
            Lang.bind(this, function(context, res, user_data) {
                this._stopSpinner();
                try {
                    let result = context.search_finish(res);
                    this._addSearchResult(result);
                } catch (e) {
                    log("Failed to search: " + e.message);
                }
            }));
    },

    searchByCategory: function(category) {
        if ('scripts' in category) {
            this.searchByScripts(category.scripts);
            return;
        }

        let criteria = Gc.SearchCriteria.new_category(category.category);
        this._searchContext = new Gc.SearchContext({ criteria: criteria });
        this._searchWithContext(this._searchContext, this.initialSearchCount);
    },

    searchByKeywords: function(keywords) {
        let criteria = Gc.SearchCriteria.new_keywords(keywords);
        this._searchContext = new Gc.SearchContext({
            criteria: criteria,
            flags: Gc.SearchFlag.WORD
        });
        this._searchWithContext(this._searchContext, this.initialSearchCount);
    },

    searchByScripts: function(scripts) {
        var criteria = Gc.SearchCriteria.new_scripts(scripts);
        this._searchContext = new Gc.SearchContext({ criteria: criteria });
        this._searchWithContext(this._searchContext, this.initialSearchCount);
    },

    cancelSearch: function() {
        this._cancellable.cancel();
        this._cancellable.reset();
    }
});

var RecentCharacterListView = new Lang.Class({
    Name: 'RecentCharacterListView',
    Extends: Gtk.Bin,
    Signals: {
        'character-selected': { param_types: [ GObject.TYPE_STRING ] }
    },

    _init: function(params) {
        let filtered = Params.filter(params, {
            category: null,
            fontFilter: null
        });
        params = Params.fill(params, {
            hexpand: true, vexpand: false
        });
        this.parent(params);

        this._fontFilter = filtered.fontFilter;
        this._characterList = new CharacterListWidget({
            hexpand: true,
            vexpand: true,
            fontDescription: this._fontFilter.fontDescription,
            numRows: 0
        });
        this._characterList.connect('character-selected',
                                    Lang.bind(this, function(w, c) {
                                        this.emit('character-selected', c);
                                    }));
        this.add(this._characterList);

        this._fontFilter.connect('filter-set',
                                 Lang.bind(this, this._updateCharacterList));

        this._category = filtered.category;
        this._characters = [];
    },

    setCharacters: function(characters) {
        let result = Gc.filter_characters(this._category, characters);
        this._characters = Util.searchResultToArray(result);
        this._updateCharacterList();
    },

    _updateCharacterList: function() {
        let [fontDescription, characters] = this._fontFilter.apply(this, this._characters);
        this._characterList.setFontDescription(fontDescription);
        this._characterList.setCharacters(characters);
        this.show_all();
    }
});
