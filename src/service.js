/* exported applicationId main */
// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (c) 2012 Giovanni Campagna <scampa.giovanni@gmail.com>
// Copyright (C) 2015  Daiki Ueno <dueno@src.gnome.org>
//
// Gnome Weather is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by the
// Free Software Foundation; either version 2 of the License, or (at your
// option) any later version.
//
// Gnome Weather is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
// for more details.
//
// You should have received a copy of the GNU General Public License along
// with Gnome Weather; if not, write to the Free Software Foundation,
// Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

pkg.initGettext();
pkg.initFormat();
pkg.require({
    'Gio': '2.0',
    'GLib': '2.0',
    'GObject': '2.0',
    'Gtk': '3.0',
});

const { Gio, GLib, GObject, Gtk } = imports.gi;

const Util = imports.util;
const SearchProvider = imports.searchProvider;

var applicationId = pkg.name;

const BackgroundService = GObject.registerClass({
    // This needs to be a Gtk.Application instead of Gio.Application,
    // to get Gtk.Clipboard working.
}, class BackgroundService extends Gtk.Application {
    _init() {
        super._init({
            application_id: applicationId,
            flags: Gio.ApplicationFlags.IS_SERVICE,
            inactivity_timeout: 30000,
        });
        GLib.set_application_name(_('Characters'));

        this._searchProvider = new SearchProvider.SearchProvider(this);
    }

    _onQuit() {
        this.quit();
    }

    vfunc_dbus_register(connection, path) {
        super.vfunc_dbus_register(connection, path);

        this._searchProvider.export(connection, path);
        return true;
    }

    /*
  Can't do until GApplication is fixed.

    vfunc_dbus_unregister(connection, path) {
        this._searchProvider.unexport(connection);

        super.vfunc_dbus_unregister(connection, path);
    },
*/

    vfunc_startup() {
        super.vfunc_startup();

        Util.initActions(this, [
            { name: 'quit', activate: this._onQuit },
        ]);
    }

    vfunc_activate() {
        // do nothing, this is a background service
    }
});

function main(argv) {
    return new BackgroundService().run(argv);
}
