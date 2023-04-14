imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const { jsUnit: JsUnit } = imports;
const { util: Util } = imports;
const { Gc, GLib, Gsk, Gtk } = imports.gi;

Gtk.init();

const emojis = ['🍕', '🤌', '🥰'];
emojis.forEach(e => JsUnit.assertTrue(
    Util.characterToIconData(e) instanceof GLib.Variant));

const whiteSpaces = ['', ' ', '\n', '\r', '\n', '\t', '\t   \n    \n \r      '];
whiteSpaces.forEach(e => JsUnit.assertNull(Util.characterToIconData(e)));

function testSearch(keywords, maxResults = 5) {
    const upper = keywords.split(' ').map(x => x.toUpperCase());
    const criteria = Gc.SearchCriteria.new_keywords(upper);
    const context = new Gc.SearchContext({ criteria, flags: Gc.SearchFlag.WORD });
    const loop = new GLib.MainLoop(null, false);

    const characters = [];
    context.search(maxResults, null, (_source, res) => {
        try {
            const result = context.search_finish(res);
            characters.push(...Util.searchResultToArray(result));
        } catch (e) {
            throw e;
        } finally {
            loop.quit();
        }
    });

    loop.run();
    return characters;
}

JsUnit.assertTrue(testSearch('pizza').includes('🍕'));
JsUnit.assertTrue(testSearch('joy').includes('😂'));
JsUnit.assertEquals(testSearch('space').length, 0);
