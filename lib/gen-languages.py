#!/usr/bin/python3

# Usage: gen-languages.py supplementalMetadata.xml
#
# The latest sources can be found at:
# https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalMetadata.xml

import xml.etree.ElementTree as et

def get_language_aliases(infile):
    result = {}
    tree = et.parse(infile)
    for data in tree.findall('metadata'):
        for data2 in data.findall('alias'):
            for lang in data2.findall('languageAlias'):
                type = lang.get('type')
                replacement = lang.get('replacement')
                result[type] = replacement
    return result

def build_header(data):
    print('#define N_LANGUAGE_ALIASES {0}'.format(len(data)))
    print('''\
struct LanguageAlias
{
  const gchar *alias;
  const gchar *replacement;
};''');
    print('''\
struct LanguageAlias language_aliases[N_LANGUAGE_ALIASES] =
  {''')
    for index, (alias, replacement) in enumerate(sorted(data.items(), key=lambda x: x[0])):
        print('    {{ "{0}", "{1}" }}'.format(alias, replacement), end='')
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
    args = parser.parse_args()

    aliases = get_language_aliases(args.cldrinfile.name)
    build_header(aliases)
