imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const { jsUnit: JsUnit } = imports;
const { util: Util } = imports;
const { GLib, Gsk, Gtk } = imports.gi;

Gtk.init();

try {
    const renderer = Gsk.GLRenderer.new();
    renderer.realize(null);
    renderer.unrealize();
} catch (e) {
    print('No GL renderer, skipping tests', e);
    imports.system.exit(77);
}

const emojis = ['🍕', '🤌', '🥰'];
emojis.forEach(e => JsUnit.assertTrue(
    Util.characterToIconData(e) instanceof GLib.Variant));
