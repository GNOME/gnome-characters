// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (c) 2013 Giovanni Campagna <scampa.giovanni@gmail.com>
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

const {Gc, Gdk, Gio, GLib, GObject} = imports.gi;

const Service = imports.service;
const Util = imports.util;

const MAX_SEARCH_RESULTS = 100;

const SearchProviderInterface = ByteArray.toString(Gio.resources_lookup_data('/org/gnome/shell/ShellSearchProvider2.xml', 0).toArray());

var SearchProvider = GObject.registerClass({
    Name: 'CharactersSearchProvider',
}, class SearchProvider extends GObject.Object {
    _init(application) {
        this._app = application;

        this._impl = Gio.DBusExportedObject.wrapJSObject(SearchProviderInterface, this);
        this._cancellable = new Gio.Cancellable();
    }

    export(connection, path) {
        return this._impl.export(connection, path);
    }

    unexport(connection) {
        return this._impl.unexport_from_connection(connection);
    }

    _runQuery(keywords, invocation) {
        this._cancellable.cancel();
        this._cancellable.reset();

        let upper = keywords.map(String.prototype.toUpperCase);
        let criteria = Gc.SearchCriteria.new_keywords(upper);
        let context = new Gc.SearchContext({ criteria: criteria,
                                             flags: Gc.SearchFlag.WORD });
        context.search(
            MAX_SEARCH_RESULTS,
            this._cancellable,
            (source_object, res, user_data) => {
                let characters = [];
                try {
                    let result = context.search_finish(res);
                    characters = Util.searchResultToArray(result);
                } catch (e) {
                    log(`Failed to search by keywords: ${e.message}`);
                }
                invocation.return_value(new GLib.Variant('(as)', [characters]));

                this._app.release();
            });
    }

    GetInitialResultSetAsync(params, invocation) {
        this._app.hold();
        this._runQuery(params[0], invocation);
    }

    GetSubsearchResultSetAsync(params, invocation) {
        this._app.hold();
        this._runQuery(params[1], invocation);
    }

    GetResultMetas(identifiers) {
        this._app.hold();

        let ret = [];

        for (let i = 0; i < identifiers.length; i++) {
            let character = identifiers[i];
            let codePoint = Util.toCodePoint(character);
            let codePointHex = codePoint.toString(16).toUpperCase();
            let name = Gc.character_name(character);
            if (name == null)
                name = _("Unknown character name");
            else
                name = Util.capitalize(name);
            let summary = _("U+%s, %s: %s").format(codePointHex,
                                                   character,
                                                   name);
            ret.push({ name: new GLib.Variant('s', name),
                       id: new GLib.Variant('s', identifiers[i]),
                       description: new GLib.Variant('s', summary),
                       icon: (new Gio.ThemedIcon({ name: Service.application_id })).serialize(),
                       clipboardText: new GLib.Variant('s', character)
                     });
        }

        this._app.release();

        return ret;
    }

    ActivateResult(id, terms, timestamp) {
        let clipboard = Gc.gtk_clipboard_get();
        clipboard.set_text(id, -1);
    }

    _getPlatformData(timestamp) {
        let display = Gdk.Display.get_default();
        let context = display.get_app_launch_context();
        context.set_timestamp(timestamp);

        let app = Gio.DesktopAppInfo.new('org.gnome.Characters.desktop');
        let id = context.get_startup_notify_id(app, []);
        return {'desktop-startup-id': new GLib.Variant('s', id) };
    }

    _activateAction(action, parameter, timestamp) {
        let wrappedParam;
        if (parameter)
            wrappedParam = [parameter];
        else
            wrappedParam = [];

        Gio.DBus.session.call('org.gnome.Characters',
                              '/org/gnome/Characters',
                              'org.freedesktop.Application',
                              'ActivateAction',
                              new GLib.Variant('(sava{sv})', [action, wrappedParam,
                                                              this._getPlatformData(timestamp)]),
                              null,
                              Gio.DBusCallFlags.NONE,
                              -1, null, (connection, result) => {
                                  try {
                                      connection.call_finish(result);
                                  } catch(e) {
                                      log(`Failed to launch application: ${e.message}`);
                                  }

                                  this._app.release();
                              });
    }

    LaunchSearch(terms, timestamp) {
        this._activateAction('search', new GLib.Variant('as', terms),
                             timestamp);
    }
});