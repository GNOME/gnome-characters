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

const {Gc, Gdk, Gio, GObject, Gtk} = imports.gi;

const Lang = imports.lang;
const Params = imports.params;
const System = imports.system;

function loadUI(resourcePath, objects) {
    let ui = new Gtk.Builder();

    if (objects) {
        for (let o in objects)
            ui.expose_object(o, objects[o]);
    }

    ui.add_from_resource(resourcePath);
    return ui;
}

function loadStyleSheet(resource) {
    let provider = new Gtk.CssProvider();
    provider.load_from_file(Gio.File.new_for_uri('resource://' + resource));
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

function initActions(actionMap, simpleActionEntries, context) {
    simpleActionEntries.forEach(function(entry) {
        let filtered = Params.filter(entry, { activate: null,
                                              state_changed: null,
                                              context: null });
        let action = new Gio.SimpleAction(entry);

        let context = filtered.context || actionMap;
        if (filtered.activate)
            action.connect('activate', filtered.activate.bind(context));
        if (filtered.state_changed)
            action.connect('state-changed', filtered.state_changed.bind(context));

        actionMap.add_action(action);
    });
}

function arrayEqual(one, two) {
    if (one.length != two.length)
        return false;

    for (let i = 0; i < one.length; i++)
        if (one[i] != two[i])
            return false;

    return true;
}

function getSettings(schemaId, path) {
    const GioSSS = Gio.SettingsSchemaSource;
    let schemaSource;

    if (!pkg.moduledir.startsWith('resource://')) {
        // Running from the source tree
        schemaSource = GioSSS.new_from_directory(pkg.pkgdatadir,
                                                 GioSSS.get_default(),
                                                 false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schemaId, true);
    if (!schemaObj) {
        log('Missing GSettings schema ' + schemaId);
        System.exit(1);
    }

    if (path === undefined)
        return new Gio.Settings({ settings_schema: schemaObj });
    else
        return new Gio.Settings({ settings_schema: schemaObj,
                                  path: path });
}

function assertEqual(one, two) {
    if (one != two)
        throw Error('Assertion failed: ' + one + ' != ' + two);
}

function assertNotEqual(one, two) {
    if (one == two)
        throw Error('Assertion failed: ' + one + ' == ' + two);
}

function capitalizeWord(w) {
    if (w.length > 0)
        return w[0].toUpperCase() + w.slice(1).toLowerCase()
    return w;
}

function capitalize(s) {
    return s.split(/\s+/).map(function(w) {
        let acronyms = ["CJK"];
        if (acronyms.indexOf(w) > -1)
            return w;
        let prefixes = ["IDEOGRAPH-", "SELECTOR-"];
        for (let index in prefixes) {
            let prefix = prefixes[index];
            if (w.startsWith(prefix))
                return capitalizeWord(prefix) + w.slice(prefix.length);
        }
        return capitalizeWord(w);
    }).join(' ');
}

function toCodePoint(s) {
    let codePoint = s.charCodeAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDBFF) {
        let high = codePoint;
        let low = s.charCodeAt(1);
        codePoint = 0x10000 + (high - 0xD800) * 0x400 + (low - 0xDC00);
    }

    return codePoint;
}

function searchResultToArray(result) {
    let characters = [];
    for (let index = 0; index < result.len; index++) {
        characters.push(Gc.search_result_get(result, index));
    }
    return characters;
}
