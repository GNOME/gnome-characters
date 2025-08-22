imports.gi.versions.Gdk = '4.0';
imports.gi.versions.Gtk = '4.0';

const { jsUnit: JsUnit } = imports;
const { util: Util } = imports;
const { Gc, GLib, Gsk, Gtk } = imports.gi;

Gtk.init();

const emojis = ['🍕', '🤌', '🥰'];
emojis.forEach((e) =>
  JsUnit.assertTrue(Util.characterToIconData(e) instanceof GLib.Variant),
);

const whiteSpaces = ['', ' ', '\n', '\r', '\n', '\t', '\t   \n    \n \r      '];
whiteSpaces.forEach((e) => JsUnit.assertNull(Util.characterToIconData(e)));

function doSearch(keywords, flags, maxResults = 5) {
  const upper = keywords.split(' ').map((x) => x.toUpperCase());
  const criteria = Gc.SearchCriteria.new_keywords(upper);
  const context = new Gc.SearchContext({ criteria, flags });
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

function compareArrays(array1, array2) {
  return (
    array1.length === array2.length &&
    array1.every((value, index) => value === array2[index])
  );
}

function runSearchTest({
  query,
  maxResults,
  expectedEmoji,
  description,
  minLength,
  maxLength,
  flags = Gc.SearchFlag.WORD,
}) {
  const results = doSearch(query, flags, maxResults);

  console.log(`${description}: [${results.join(', ')}]`);

  if (expectedEmoji) {
    if (Array.isArray(expectedEmoji)) {
      // Check exact match of first N results
      const firstResults = results.slice(0, expectedEmoji.length);
      JsUnit.assertTrue(compareArrays(expectedEmoji, firstResults));
    } else {
      // Check that the emoji is the first result
      JsUnit.assertTrue(results[0] === expectedEmoji);
    }
  }

  if (maxLength) {
    JsUnit.assertTrue(results.length <= maxLength);
  }

  if (minLength) {
    JsUnit.assertTrue(results.length >= minLength);
  }
}

function runKeywordSearchTest(testCase) {
  return runSearchTest({ ...testCase, flags: Gc.SearchFlag.KEYWORD });
}

// Word search test cases
const wordSearchTests = [
  {
    query: 'pizza',
    maxResults: 10,
    expectedEmoji: '🍕',
    description: 'Pizza word search',
  },
  {
    query: 'joy',
    maxResults: 10,
    expectedEmoji: ['🕹️', '😂', '😹', '䷹', '𝌝', '🕹'],
    description: 'Joy word search',
  },
  {
    query: 'heart',
    maxResults: 10,
    minLength: 1,
    description: 'Heart word search',
  },
  { query: 'love', maxResults: 10, description: 'Love word search' },
  { query: 'animal', maxResults: 5, description: 'Animal word search' },
  {
    query: 'food',
    maxResults: 4,
    minLength: 1,
    description: 'Food word search',
  },
  { query: 'italian', maxResults: 10, description: 'Italian word search' },
  { query: 'space', maxResults: 5, description: 'Space word search' },
  {
    query: 'face',
    maxResults: 2,
    maxLength: 2,
    description: 'Face word search (limited)',
  },
];

// Keyword search test cases
const keywordSearchTests = [
  {
    query: 'pizza',
    maxResults: 5,
    expectedEmoji: ['🍕'],
    description: 'Pizza keyword search',
  },
  {
    query: 'pizz',
    maxResults: 5,
    expectedEmoji: ['🍕'],
    description: 'Pizza partial match keyword search',
  },
  {
    query: 'joy',
    maxResults: 5,
    expectedEmoji: '😂',
    description: 'Joy keyword search',
  },
  { query: 'space', maxResults: 10, description: 'Space keyword search' },
];

wordSearchTests.forEach(runSearchTest);
keywordSearchTests.forEach(runKeywordSearchTest);
