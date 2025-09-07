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

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { SidebarRow } from './sidebarRow.js';

export const Sidebar = GObject.registerClass({
    Template: 'resource:///org/gnome/Characters/sidebar.ui',
    InternalChildren: [
        'list',
        'recentRow', 'emojiSmileysRow', 'emojiPeopleRow', 'emojiAnimalsRow',
        'emojiFoodRow', 'emojiActivitiesRow', 'emojiTravelRow',
        'emojiObjectsRow', 'emojiSymbolsRow', 'emojiFlagsRow',
        'lettersPunctuationRow', 'lettersArrowsRow',
        'lettersBulletsRow', 'lettersPicturesRow',
        'lettersCurrencyRow', 'lettersMathRow', 'lettersLatinRow',
    ],
}, class Sidebar extends Adw.Bin {
    constructor() {
        GObject.type_ensure(SidebarRow.$gtype);
        super();

        this.lastSelectedRow = null;
    }

    /**
     * Restore the latest selected item
     */
    restoreSelection() {
        if (this.lastSelectedRow)
            this._list.select_row(this.lastSelectedRow);
    }

    rowByName(name) {
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
        default:
            return this._recentRow;
        }
    }

    selectRowByName(name) {
        let row = this.rowByName(name);
        this._list.select_row(row);
    }

    unselectAll() {
        this._list.unselect_all();
    }

    get list() {
        return this._list;
    }
});
