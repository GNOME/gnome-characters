imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const { jsUnit: JsUnit } = imports;
const { util: Util } = imports;
const { GLib, Gsk, Gtk } = imports.gi;

Gtk.init();

const emojis = ['🍕', '🤌', '🥰'];
emojis.forEach(e => JsUnit.assertTrue(
    Util.characterToIconData(e) instanceof GLib.Variant));

const whiteSpaces = ['', ' ', '\n', '\r', '\n', '\t', '\t   \n    \n \r      '];
whiteSpaces.forEach(e => JsUnit.assertNull(Util.characterToIconData(e)));
