#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/UnicodeData.txt

import io
import re

class Builder(object):
    def __init__(self):
        pass

    def read(self, infile):
        names = []
        for line in infile:
            if line.startswith('#'):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            (codepoint, name, _other) = line.split(';', 2)

            # Names starting with < are signifying controls and special blocks,
            # they aren't useful for us
            if name[0] == '<':
                continue

            names.append((codepoint, name))

        return names

    def write(self, data):
        print('''\
struct CharacterName
{
  gunichar uc;
  const char *name;
};''')
        print('static const struct CharacterName character_names[] =\n  {')
        s = ''
        offset = 0
        for codepoint, name in data:
            print('    {{ 0x{0}, "{1}" }},'.format(codepoint, name))
        print('  };')

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='build')
    parser.add_argument('infile', type=argparse.FileType('r'),
                        help='input file')
    args = parser.parse_args()

    builder = Builder()
    # FIXME: argparse.FileType(encoding=...) is available since Python 3.4
    data = builder.read(io.open(args.infile.name, encoding='utf_8_sig'))
    builder.write(data)
