/* exported CharactersView */
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

const { Gc, Gdk, Gio, GLib, GnomeDesktop, GObject, Gtk, Pango, Graphene } = imports.gi;

Gio._promisify(Gc.SearchContext.prototype, 'search', 'search_finish');

const Util = imports.util;

const BASELINE_OFFSET = 0.85;
const CELLS_PER_ROW = 5;
const NUM_ROWS = 5;
const NUM_COLUMNS = 3;
const CELL_SIZE = 50;

function getCellSize(fontDescription) {
    if (fontDescription === null || fontDescription.get_size() === 0)
        return CELL_SIZE;
    return fontDescription.get_size() * 2 / Pango.SCALE;
}

const CharacterListRow = GObject.registerClass({
}, class CharacterListRow extends GObject.Object {
    _init(characters, fontDescription, overlayFontDescription) {
        super._init({});

        this._baseGlyphRect = null;
        this._characters = characters;
        this._fontDescription = fontDescription;
        this._overlayFontDescription = overlayFontDescription;
    }

    snapshot(snapshot, x, y, pangoContext, styleContext) {
        let layout = Pango.Layout.new(pangoContext);
        layout.set_font_description(this._fontDescription);

        // Draw characters.  Do centering and attach to the baseline.
        let cellSize = getCellSize(this._fontDescription);
        for (let i in this._characters) {
            let character = this._characters[i];
            let cellRect = new Gdk.Rectangle({
                x: x + cellSize * i,
                y,
                width: cellSize,
                height: cellSize,
            });

            layout.set_text(character, -1);
            snapshot.save();
            if (Gc.character_is_invisible(character)) {
                this._drawBoundingBox(snapshot, layout, styleContext, cellRect);
                this._drawCharacterName(snapshot, pangoContext, styleContext, cellRect, character);
            } else if (layout.get_unknown_glyphs_count() === 0) {
                let layoutBaseline = layout.get_baseline();
                let logicalRect = layout.get_extents()[0];
                snapshot.translate(new Graphene.Point({
                    x: x + cellSize * i - logicalRect.x / Pango.SCALE + (cellSize - logicalRect.width / Pango.SCALE) / 2,
                    y: y + BASELINE_OFFSET * cellSize - layoutBaseline / Pango.SCALE,
                }));

                let textColor = styleContext.get_color();
                snapshot.append_layout(layout, textColor);

            } else {
                this._drawBoundingBox(snapshot, layout, styleContext, cellRect);
                this._drawCharacterName(snapshot, pangoContext, styleContext, cellRect, character);
            }
            snapshot.restore();
        }
    }

    _computeBoundingBox(layout, cellRect) {
        let shapeRect;
        let layoutBaseline;
        if (layout.get_unknown_glyphs_count() === 0) {
            let inkRect = layout.get_extents()[1];
            layoutBaseline = layout.get_baseline();
            shapeRect = inkRect;
        } else {
            // If the character cannot be rendered with the current
            // font settings, show a rectangle calculated from the
            // base glyphs ('AA').
            if (this._baseGlyphRect === null) {
                layout.set_text('AA', -1);
                let baseInkRect = layout.get_extents()[1];
                this._baseGlyphLayoutBaseline = layout.get_baseline();
                this._baseGlyphRect = baseInkRect;
            }
            layoutBaseline = this._baseGlyphLayoutBaseline;
            shapeRect = new Pango.Rectangle({
                x: this._baseGlyphRect.x,
                y: this._baseGlyphRect.y,
                width: this._baseGlyphRect.width,
                height: this._baseGlyphRect.height,
            });
        }

        shapeRect.x = cellRect.x - shapeRect.x / Pango.SCALE + (cellRect.width - shapeRect.width / Pango.SCALE) / 2;
        shapeRect.y = cellRect.y + BASELINE_OFFSET * cellRect.height - layoutBaseline / Pango.SCALE;
        shapeRect.width /= Pango.SCALE;
        shapeRect.height /= Pango.SCALE;
        return shapeRect;
    }

    _drawBoundingBox(snapshot, pangoLayout, styleContext, cellRect) {
        snapshot.save();

        let shapeRect = this._computeBoundingBox(pangoLayout, cellRect);
        let borderWidth = 1;

        let boxBgColor = styleContext.get_color();
        boxBgColor.alpha = 0.05;

        snapshot.append_color(boxBgColor,
            new Graphene.Rect({
                origin: new Graphene.Point({
                    x: shapeRect.x - borderWidth * 2,
                    y: shapeRect.y - borderWidth * 2,
                }),
                size: new Graphene.Size({
                    width: shapeRect.width + borderWidth * 2,
                    height: shapeRect.height + borderWidth * 2,
                }),
            }),
        );
        snapshot.restore();
    }

    _drawCharacterName(snapshot, pangoContext, styleContext, cellRect, uc) {
        snapshot.save();

        let layout = Pango.Layout.new(pangoContext);
        layout.set_width(cellRect.width * Pango.SCALE * 0.8);
        layout.set_height(cellRect.height * Pango.SCALE * 0.8);
        layout.set_wrap(Pango.WrapMode.WORD);
        layout.set_ellipsize(Pango.EllipsizeMode.END);
        layout.set_alignment(Pango.Alignment.CENTER);
        layout.set_font_description(this._overlayFontDescription);
        let name = Gc.character_name(uc);
        let text = name === null ? _('Unassigned') : Util.capitalize(name);
        layout.set_text(text, -1);
        let logicalRect = layout.get_extents()[0];
        snapshot.translate(new Graphene.Point({
            x: cellRect.x - logicalRect.x / Pango.SCALE + (cellRect.width - logicalRect.width / Pango.SCALE) / 2,
            y: cellRect.y - logicalRect.y / Pango.SCALE + (cellRect.height - logicalRect.height / Pango.SCALE) / 2,
        }));

        let textColor = styleContext.get_color();
        snapshot.append_layout(layout, textColor);
        snapshot.restore();
    }
});

var CharactersView = GObject.registerClass({
    Signals: {
        'character-selected': { param_types: [GObject.TYPE_STRING] },
    },
    Properties: {
        'vscroll-policy': GObject.ParamSpec.override('vscroll-policy', Gtk.Scrollable),
        'vadjustment': GObject.ParamSpec.override('vadjustment', Gtk.Scrollable),
        'hscroll-policy': GObject.ParamSpec.override('hscroll-policy', Gtk.Scrollable),
        'hadjustment': GObject.ParamSpec.override('hadjustment', Gtk.Scrollable),
        'loading': GObject.ParamSpec.boolean(
            'loading',
            'Loading', 'Whether the category is still loading',
            GObject.ParamFlags.READWRITE,
            false,
        ),
        'baseline': GObject.ParamSpec.boolean(
            'baseline',
            'Baseline', 'Whether to draw a baseline or not',
            GObject.ParamFlags.READWRITE,
            true,
        ),
    },
    Implements: [Gtk.Scrollable],
}, class CharactersView extends Gtk.Widget {
    _init() {
        super._init({
            vadjustment: new Gtk.Adjustment(),
            hadjustment: new Gtk.Adjustment(),
            overflow: Gtk.Overflow.HIDDEN,
        });

        this._scripts = [];
        this._scriptsLoaded = false;

        let context = this.get_pango_context();
        this._fontDescription = context.get_font_description();
        this._fontDescription.set_size(CELL_SIZE * Pango.SCALE);

        this._selectedCharacter = null;
        this._characters = [];
        this._searchContext = null;
        this._cancellable = new Gio.Cancellable();
        this._cancellable.connect(() => {
            this._searchContext = null;
            this._characters = [];
        });

        this._cellsPerRow = CELLS_PER_ROW;
        this._numRows = NUM_ROWS;
        this._rows = [];
        /*
        this.drag_source_set(Gdk.ModifierType.BUTTON1_MASK,
                             null,
                             Gdk.DragAction.COPY);
        this.drag_source_add_text_targets();
        */
        const gestureClick = new Gtk.GestureClick();
        gestureClick.connect('pressed', this.onButtonPress.bind(this));
        gestureClick.connect('released', this.onButtonRelease.bind(this));
        this.add_controller(gestureClick);
    }

    get fontDescription() {
        return this._fontDescription;
    }

    get vadjustment() {
        return this._vadjustment;
    }

    set vadjustment(adj) {
        adj.connect('value-changed', () => {
            this.queue_draw();
        });
        this._vadjustment = adj;
    }

    get hadjustment() {
        return this._hadjustment;
    }

    set hadjustment(adj) {
        adj.connect('value-changed', () => {
            this.queue_draw();
        });
        this._hadjustment = adj;
    }

    /*
    vfunc_drag_begin(context) {
        let cellSize = getCellSize(this._fontDescription);
        this._dragSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32,
                                                   cellSize,
                                                   cellSize);
        let cr = new Cairo.Context(this._dragSurface);
        cr.setSourceRGBA(1.0, 1.0, 1.0, 1.0);
        cr.paint();
        cr.setSourceRGBA(0.0, 0.0, 0.0, 1.0);
        let row = this._createCharacterListRow([this._character]);
        row.draw(cr, 0, 0, cellSize, cellSize, this.get_style_context());
        Gtk.drag_set_icon_surface(context, this._dragSurface, 0, 0);
    }

    vfunc_drag_data_get(context, data, info, time) {
        if (this._character !== null)
            data.set_text(this._character, -1);
    }
    */

    onButtonPress(_gesture, _nPress, x, y) {
        let hadj = this.get_hadjustment();
        let vadj = this.get_vadjustment();

        let cellSize = getCellSize(this._fontDescription);
        x = Math.min(this._cellsPerRow - 1, Math.floor((x + hadj.get_value() - this._offsetX) / cellSize));
        y = Math.floor((y + vadj.get_value()) / cellSize);

        let index = y * this._cellsPerRow + Math.max(0, x);
        if (index < this._characters.length)
            this._selectedCharacter = this._characters[index];
        else
            this._selectedCharacter = null;
    }

    onButtonRelease() {
        if (this._selectedCharacter)
            this.emit('character-selected', this._selectedCharacter);
    }

    vfunc_measure(orientation, _forSize) {
        if (orientation === Gtk.Orientation.HORIZONTAL) {
            let cellSize = getCellSize(this._fontDescription);
            let minWidth = NUM_COLUMNS * cellSize;
            let natWidth = Math.max(this._cellsPerRow, NUM_COLUMNS) * cellSize;
            return [minWidth, natWidth, -1, -1];
        } else {
            let height = Math.max(this._rows.length, this._numRows) *
                getCellSize(this._fontDescription);
            return [height, height, -1, -1];
        }
    }

    vfunc_snapshot(snapshot) {
        let vadj = this.get_vadjustment();
        let styleContext = this.get_style_context();
        let pangoContext =  this.get_pango_context();

        let cellSize = getCellSize(this._fontDescription);
        let scrollPos = Math.floor(vadj.get_value());

        let start = Math.max(0, Math.floor(scrollPos / cellSize));
        let end = Math.min(this._rows.length, Math.ceil((scrollPos + vadj.get_page_size()) / cellSize));
        let offsetY = scrollPos % cellSize;

        snapshot.translate(new Graphene.Point({ x: 0, y: -offsetY }));

        let borderColor = styleContext.lookup_color('borders')[1];
        let allocatedWidth = this.get_allocation().width;
        this._offsetX = (allocatedWidth - cellSize * this._cellsPerRow) / 2;

        for (let index = start; index < end; index++) {
            let y = (index - start) * cellSize;

            // Draw baseline.
            if (this.baseline) {
                snapshot.append_color(borderColor, new Graphene.Rect({
                    origin: new Graphene.Point({ x: 0, y: y + BASELINE_OFFSET * cellSize }),
                    size: new Graphene.Size({ width: allocatedWidth, height: 1.0 }),
                }));
            }

            this._rows[index].snapshot(snapshot, this._offsetX, y, pangoContext, styleContext);
        }
    }

    vfunc_size_allocate(width, height, baseline) {
        super.vfunc_size_allocate(width, height, baseline);
        let cellSize = getCellSize(this._fontDescription);
        let cellsPerRow = Math.floor(width / cellSize);

        if (cellsPerRow !== this._cellsPerRow) {
            // Reflow if the number of cells per row has changed.
            this._cellsPerRow = cellsPerRow;
            this._reflow();
        }

        let maxHeight = Math.floor((this._rows.length + BASELINE_OFFSET) * cellSize);
        let maxWidth = cellsPerRow * cellSize;

        let hadj = this.get_hadjustment();
        let vadj = this.get_vadjustment();
        vadj.configure(vadj.get_value(), 0.0, maxHeight, 0.1 * height, 0.9 * height, Math.min(height, maxHeight));
        hadj.configure(hadj.get_value(), 0.0, maxWidth, 0.1 * width, 0.9 * width, Math.min(width, maxWidth));
    }

    _createCharacterListRow(characters) {
        var context = this.get_pango_context();
        var overlayFontDescription = context.get_font_description();
        overlayFontDescription.set_size(overlayFontDescription.get_size() * 0.8);

        let row = new CharacterListRow(characters, this._fontDescription, overlayFontDescription);
        return row;
    }

    setFontDescription(fontDescription) {
        this._fontDescription = fontDescription;
    }

    _reflow() {
        this._rows = [];

        let start = 0, stop = 1;
        for (; stop <= this._characters.length; stop++) {
            if (stop % this._cellsPerRow === 0) {
                let rowCharacters = this._characters.slice(start, stop);
                let row = this._createCharacterListRow(rowCharacters);
                this._rows.push(row);
                start = stop;
            }
        }
        if (start !== stop - 1) {
            let rowCharacters = this._characters.slice(start, stop);
            let row = this._createCharacterListRow(rowCharacters);
            this._rows.push(row);
        }
    }

    setCharacters(characters) {
        this._characters = characters;
        this._reflow();
        this.queue_resize();
    }

    _addSearchResult(result) {
        const characters = Util.searchResultToArray(result);
        this.setCharacters(this._characters.concat(characters));
    }

    async _searchWithContext(context) {
        try {
            let result = await context.search(Number.MAX_SAFE_INTEGER, this._cancellable);
            this._addSearchResult(result);
        } catch (e) {
            log(`Failed to search: ${e.message}`);
        }
    }

    async searchByCategory(category) {
        this._characters = [];
        // whether to draw a baseline or not
        this.baseline = category <= Gc.Category.LETTER_LATIN;

        if (category === Gc.Category.LETTER_LATIN) {
            if (!this._scriptsLoaded)
                await this.populateScripts(); // we run the search once the scripts are loaded

            await this._searchByScripts();

            return;
        }

        let criteria = Gc.SearchCriteria.new_category(category);
        this._searchContext = new Gc.SearchContext({ criteria });
        await this._searchWithContext(this._searchContext);
    }

    async searchByKeywords(keywords) {
        const criteria = Gc.SearchCriteria.new_keywords(keywords);
        this._searchContext = new Gc.SearchContext({
            criteria,
            flags: Gc.SearchFlag.WORD,
        });
        await this._searchWithContext(this._searchContext);
        return this._characters.length;
    }

    async _searchByScripts() {
        var criteria = Gc.SearchCriteria.new_scripts(this.scripts);
        this._searchContext = new Gc.SearchContext({ criteria });
        await this._searchWithContext(this._searchContext);
    }

    cancelSearch() {
        this._cancellable.cancel();
        this._cancellable.reset();
    }

    // / Specific to GC_CATEGORY_LETTER_LATIN
    get scripts() {
        return this._scripts;
    }

    // / Populate the "scripts" based on the current locale
    // / and the input-sources settings.
    async populateScripts() {
        this.loading = true;
        let sources = await Util.getInputSources();
        let hasIBus = sources.some((current, _index, _array) => {
            return current[0] === 'ibus';
        });
        if (hasIBus)
            await this._ensureIBusLanguageList(sources);
        else
            this._finishBuildScriptList(sources);
    }

    async _ensureIBusLanguageList(sources) {
        if (this._ibusLanguageList !== undefined)
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
        Gio._promisify(ibus.Bus.prototype, 'list_engines_async', 'list_engines_async_finish');

        ibus.init();
        let bus = new ibus.Bus();
        if (bus.is_connected()) {
            let engines = await bus.list_engines_async(-1, null);
            try {
                for (let j in engines) {
                    let engine = engines[j];
                    let language = engine.get_language();
                    if (language !== null)
                        this._ibusLanguageList[engine.get_name()] = language;
                }
            } catch (e) {
                log(`Failed to list engines: ${e.message}`);
            }

        }
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
            if (language === null)
                continue;
            let scripts = Gc.get_scripts_for_language(languages[i]);
            for (let j in scripts) {
                let script = scripts[j];
                // Exclude Latin and Han, since Latin is always added
                // at the top and Han contains too many characters.
                if ([GLib.UnicodeScript.LATIN, GLib.UnicodeScript.HAN].indexOf(script) >= 0)
                    continue;
                if (allScripts.indexOf(script) >= 0)
                    continue;
                allScripts.push(script);
            }
        }

        allScripts.unshift(GLib.UnicodeScript.LATIN);

        this._scripts = allScripts;
        this._scriptsLoaded = true;
        this.loading = false;
        this._searchByScripts();
    }
});
