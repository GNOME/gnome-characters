/* exported capitalize getSettings getInputSources initActions searchResultToArray toCodePoint characterToIconData */
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

const { Gc, Gio, Gdk, GLib, Graphene, Gsk, Gtk, PangoCairo, Pango } = imports.gi;

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const System = imports.system;

function initActions(actionMap, simpleActionEntries, context) {
    simpleActionEntries.forEach(({ name, parameterType, state, activate }) =>  {
        let action = new Gio.SimpleAction({
            name,
            parameter_type: parameterType || null,
            state: state || null,
        });

        context = context || actionMap;
        if (activate)
            action.connect('activate', activate.bind(context));
        actionMap.add_action(action);
    });
}


function getSettings(schemaId, path) {
    const GioSSS = Gio.SettingsSchemaSource;
    let schemaSource;

    if (!pkg.moduledir.startsWith('resource://')) {
        // Running from the source tree
        schemaSource = GioSSS.new_from_directory(pkg.pkgdatadir, GioSSS.get_default(), false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schemaId, true);
    if (!schemaObj) {
        log(`Missing GSettings schema ${schemaId}`);
        System.exit(1);
    }

    if (path === undefined)
        return new Gio.Settings({ settings_schema: schemaObj });
    else
        return Gio.Settings.new_full(schemaObj, null, path);
}

function isFlatpak() {
    const file = Gio.File.new_for_path('/.flatpak-info');

    return file.query_exists(null);
}

async function getInputSources() {
    if (isFlatpak()) {
        try {
            let reply = await Gio.DBus.session.call(
                'org.freedesktop.portal.Desktop',
                '/org/freedesktop/portal/desktop',
                'org.freedesktop.portal.Settings',
                'ReadOne',
                new GLib.Variant('(ss)', ['org.gnome.desktop.input-sources', 'sources']),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null);
            let sources = reply.get_child_value(0).get_variant();
            return sources.deep_unpack();
        } catch (e) {
            log(`Failed to read settings from the settings portal: ${e.message}`);
            return [];
        }
    }

    let settings =
        getSettings('org.gnome.desktop.input-sources',
            '/org/gnome/desktop/input-sources/');
    if (settings)
        return settings.get_value('sources').deep_unpack();

    return [];
}

function capitalizeWord(w) {
    if (w.length > 0)
        return w[0].toUpperCase() + w.slice(1).toLowerCase();
    return w;
}

function capitalize(s) {
    return s.split(/\s+/).map(w => {
        let acronyms = ['CJK'];
        if (acronyms.indexOf(w) > -1)
            return w;
        let prefixes = ['IDEOGRAPH-', 'SELECTOR-'];
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
        const c = Gc.search_result_get(result, index);

        if (c.trim().length)
            characters.push(c);
    }

    return characters;
}

function characterToIconData(character) {
    let size = 48.0;

    if (!character || !character.trim().length)
        return null;

    const fontMap = PangoCairo.FontMap.get_default();
    const context = fontMap.create_context();
    const layout = Pango.Layout.new(context);
    layout.set_text(character, -1);
    let white = new Gdk.RGBA({ red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0 });

    let [textWidth, textHeight] = layout.get_pixel_size();
    let textSize = Math.max(textWidth, textHeight);

    const snapshot = Gtk.Snapshot.new();

    let originX = (textSize - textWidth) / 2.0;
    let originY = (textSize - textHeight) / 2.0;
    let origin = new Graphene.Point({ x: originX, y: originY });

    let ratio = size / textSize;
    snapshot.scale(ratio, ratio);

    snapshot.save();
    snapshot.translate(origin);
    snapshot.append_layout(layout, white);
    snapshot.restore();

    const node = snapshot.to_node();
    // The snapshot may contain no nodes if there's nothing to render, like in
    // case of a layout that only contains invisible chars:
    //   https://gitlab.gnome.org/GNOME/gtk/-/issues/5747
    if (!node)
        return null;

    let renderer = Gsk.GLRenderer.new();
    try {
        renderer.realize(null);
    } catch (e) {
        renderer = new Gsk.CairoRenderer();
        renderer.realize(null);
    }

    let rect = new Graphene.Rect({
        origin: new Graphene.Point({ x: 0.0, y: 0.0 }),
        size: new Graphene.Size({ width: size, height: size }),
    });
    const texture = renderer.render_texture(node, rect);
    renderer.unrealize();

    const textureDownloader = new Gdk.TextureDownloader(texture);
    textureDownloader.set_format(Gdk.MemoryFormat.R8G8B8A8);
    const [bytes, stride] = textureDownloader.download_bytes();

    return GLib.Variant.new_tuple([
        new GLib.Variant('i', texture.get_width()),
        new GLib.Variant('i', texture.get_height()),
        new GLib.Variant('i', stride),
        new GLib.Variant('b', /* has alpha */ true),
        new GLib.Variant('i', /* bits per sample */ 8),
        new GLib.Variant('i', /* channels */ 4),
        GLib.Variant.new_from_bytes(
            GLib.VariantType.new('ay'), bytes, true),
    ]);
}
