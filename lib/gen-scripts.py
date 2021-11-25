#!/usr/bin/python3

# Usage: gen-scripts.py --cldrinfile .../supplementalData.xml \
#                       --ucdinfile .../PropertyValueAliases.txt
#
# The latest sources can be found at:
# https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml
# http://www.unicode.org/Public/UCD/latest/ucd/PropertyValueAliases.txt

import io
import re
import xml.etree.ElementTree as et

ISO_ALIASES = { 'Hans': ['Hani'], 'Hant': ['Hani'],
                'Jpan': ['Hrkt'],
                'Kore': ['Hang'] }
UCD_ALIASES = { 'Katakana_Or_Hiragana': ['Katakana', 'Hiragana'] }
DEFAULT_ALIASES = { 'en': ['Latin'] }

def get_language_data(infile, aliases):
    result = {}
    tree = et.parse(infile)
    for data in tree.findall('languageData'):
        for lang in data.findall('language'):
            type = lang.get('type')
            scripts = lang.get('scripts')
            if not scripts:
                continue
            territories = lang.get('territories')
            keys = []
            if territories:
                for territory in territories.split(' '):
                    keys.append('{0}_{1}'.format(type, territory))
            else:
                keys.append(type)

            scripts = scripts.split(' ')

            # Resolve aliases of the ISO 15924 codes.
            scripts = [ISO_ALIASES.get(script, [script]) for script in scripts]
            scripts = [script for elements in scripts for script in elements]

            # Resolve ISO 15924 to Unicode mapping.
            scripts = [aliases[script] for script in scripts
                       if script in aliases]

            # Resolve aliases of Unicode script names.
            scripts = [UCD_ALIASES.get(script, [script]) for script in scripts]
            scripts = [script for elements in scripts for script in elements]

            scripts = set(scripts)
            scripts = sorted(scripts)

            if len(scripts) == 0:
                continue
            for key in keys:
                result[key] = scripts
    temp = dict(DEFAULT_ALIASES)
    temp.update(result)
    return temp

def get_aliases(infile):
    result = {}
    for line in infile:
        if not line.startswith('sc'):
            continue
        (sc, iso, ucd, *comment) = re.split('\s*;\s*', line.strip())
        result[iso] = ucd
    return result

def build_header(data):
    print('#define NLANGUAGES {0}'.format(len(data)))
    print('''\
struct LanguageScripts
{{
  const gchar *language;
  const gchar *scripts[{0}];
}};'''.format(max([len(v) for v in data.values()])+1))
    print('''\
struct LanguageScripts language_scripts[NLANGUAGES] =
  {''')
    for index, (lang, scripts) in enumerate(sorted(data.items(), key=lambda x: x[0])):
        print('    {{ "{0}", {{ {1} }} }}'.format(lang, ', '.join(['N_("{0}")'.format(script) for script in scripts] + ['NULL'])), end='')
        if index + 1 < len(data):
            print(',')
        else:
            print('')
    print('};')

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='build')
    parser.add_argument('cldrinfile', type=argparse.FileType('r'),
                        help='CLDR input file')
    parser.add_argument('ucdinfile', type=argparse.FileType('r'),
                        help='UCD input file')
    args = parser.parse_args()

    # FIXME: argparse.FileType(encoding=...) is available since Python 3.4
    aliases = get_aliases(io.open(args.ucdinfile.name, encoding='utf_8_sig'))
    data = get_language_data(args.cldrinfile, aliases)
    build_header(data)
