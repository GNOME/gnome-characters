/* exported main settings */
// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (c) 2013 Giovanni Campagna <scampa.giovanni@gmail.com>
//
// Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//   * Redistributions of source code must retain the above copyright
//     notice, this list of conditions and the following disclaimer.
//   * Redistributions in binary form must reproduce the above copyright
//     notice, this list of conditions and the following disclaimer in the
//     documentation and/or other materials provided with the distribution.
//   * Neither the name of the GNOME Foundation nor the
//     names of its contributors may be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import Adw from 'gi://Adw?version=1';
import Gdk_ from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import GObject from 'gi://GObject?version=2.0';
import Gtk_ from 'gi://Gtk?version=4.0';
import GnomeDesktop_ from 'gi://GnomeDesktop?version=4.0';

import { CharactersView } from './charactersView.js';
import { Sidebar } from './sidebar.js';
import { MainWindow } from './window.js';
import * as Util from './util.js';
import { SearchProvider } from './searchProvider.js';
export let settings = null;

const MyApplication = GObject.registerClass({
}, class MyApplication extends Adw.Application {
    constructor() {
        super({
            application_id: pkg.name,
            flags: Gio.ApplicationFlags.FLAGS_NONE,
            resource_base_path: '/org/gnome/Characters',
        });
        GLib.set_application_name(_('Characters'));

        this._searchProvider = new SearchProvider(this);
    }

    get window() {
        return this._appwindow;
    }

    _onQuit() {
        this.quit();
    }

    vfunc_startup() {
        super.vfunc_startup();

        this.get_style_manager().set_color_scheme(Adw.ColorScheme.PREFER_LIGHT);

        Util.initActions(this, [
            { name: 'quit', activate: this._onQuit },
        ]);
        this.set_accels_for_action('app.quit', ['<Primary>q']);
        this.set_accels_for_action('win.find', ['<Primary>f']);
        this.set_accels_for_action('win.show-help-overlay', ['<Primary>question']);

        settings = Util.getSettings('org.gnome.Characters',
            '/org/gnome/Characters/');

        if (this.get_flags() & Gio.ApplicationFlags.IS_SERVICE)
            this.set_inactivity_timeout(10000);

        log('Characters Application started');
    }

    vfunc_dbus_register(connection, path) {
        const searchProviderPath = `${path}/SearchProvider`;
        super.vfunc_dbus_register(connection, searchProviderPath);
        this._searchProvider.export(connection, searchProviderPath);
        return true;
    }

    vfunc_activate() {
        super.vfunc_activate();

        if (!this._appwindow)
            this._appwindow = new MainWindow(this);

        if (pkg.name.endsWith('Devel'))
            this._appwindow.add_css_class('devel');

        this._appwindow.present();
        log('Characters Application activated');
    }

    vfunc_shutdown() {
        log('Characters Application exiting');

        super.vfunc_shutdown();
    }
});

pkg.initGettext();
pkg.initFormat();

/**
 * Main entry point for the application
 *
 * @param {string[]} argv - Command line arguments
 */
export function main(argv) {
    GObject.type_ensure(CharactersView.$gtype);
    GObject.type_ensure(Sidebar.$gtype);

    return new MyApplication().runAsync(
        [imports.system.programInvocationName].concat(argv)
    );
}
