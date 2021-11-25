#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/Jamo.txt

import io
import re

class Builder(object):
    def __init__(self):
        pass

    def read(self, infile):
        chars = []
        for line in infile:
            if line.startswith('#'):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            data, _comment = line.split('#', 2)
            codepoint, short_name = data.split(';')
            short_name = short_name.strip()

            chars.append((codepoint, short_name))

        return chars

    def write(self, data):
        print('''\
struct HangulCharacter
{
  gunichar uc;
  const char *short_name;
};''')
        print('static const struct HangulCharacter hangul_chars[] =\n  {')
        s = ''
        offset = 0
        for codepoint, short_name in data:
            print('    {{ 0x{0}, "{1}" }},'.format(codepoint, short_name))
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
