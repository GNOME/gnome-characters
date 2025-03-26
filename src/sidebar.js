/* exported Sidebar */
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


const { Adw, Gtk, GObject } = imports.gi;
const { SidebarItem } = imports.sidebarItem;

var Sidebar = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/sidebar.ui',
    InternalChildren: [
        'sidebar',
        'recentRow', 'emojiSmileysRow', 'emojiPeopleRow', 'emojiAnimalsRow',
        'emojiFoodRow', 'emojiActivitiesRow', 'emojiTravelRow',
        'emojiObjectsRow', 'emojiSymbolsRow', 'emojiFlagsRow',
        'lettersPunctuationRow', 'lettersArrowsRow',
        'lettersBulletsRow', 'lettersPicturesRow',
        'lettersCurrencyRow', 'lettersMathRow', 'lettersLatinRow',
    ],
    Properties: {
        'mode': GObject.ParamSpec.enum(
            'mode',
            'Mode', 'Mode',
            GObject.ParamFlags.READWRITE,
            Adw.SidebarMode.$gtype,
            Adw.SidebarMode.SIDEBAR,
        ),
    },
    Signals: {
        'activated': { param_types: [] },
    },
}, class Sidebar extends Adw.Bin {
    _init() {
        GObject.type_ensure(SidebarItem.$gtype);
        super._init({});

        this._sidebar.connect('activated', _index => {
            this.emit('activated');
        });

        this.lastSelectedItem = null;
    }

    /**
     * Restore the latest selected item
     */
    restoreSelection() {
        if (this.lastSelectedItem)
            this._sidebar.selected = this.lastSelectedItem.get_index();
    }

    itemByName(name) {
        switch (name) {
        case 'smileys':
            return this._emojiSmileysRow;
        case 'people':
            return this._emojiPeopleRow;
        case 'animals':
            return this._emojiAnimalsRow;
        case 'food':
            return this._emojiFoodRow;
        case 'activities':
            return this._emojiActivitesRow;
        case 'travel':
            return this._emojiTravelRow;
        case 'objects':
            return this._emojiObjectsRow;
        case 'symbols':
            return this._emojiSymbolsRow;
        case 'flags':
            return this._emojiFlagsRow;
        case 'punctuation':
            return this._lettersPunctuationRow;
        case 'arrows':
            return this._lettersArrowsRow;
        case 'bullets':
            return this._lettersBulletsRow;
        case 'pictures':
            return this._lettersPicturesRow;
        case 'currency':
            return this._lettersCurrencyRow;
        case 'math':
            return this._lettersMathRow;
        case 'latin':
            return this._lettersLatinRow;
        case 'recent':
        default:
            return this._recentRow;
        }
    }

    selectRowByName(name) {
        let item = this.itemByName(name);
        this._sidebar.selected = item.get_index();
        this.emit('activated');
    }

    unselectAll() {
        this._sidebar.selected = Gtk.INVALID_LIST_POSITION;
    }

    get sidebar() {
        return this._sidebar;
    }

    get mode() {
        return this.sidebar.mode;
    }

    set mode(value) {
        this.sidebar.mode = value;
    }
});
