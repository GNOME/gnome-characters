#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/Blocks.txt

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
            range, name = line.split(';', 2)
            start, end = range.split('..')
            name = name.lstrip()

            names.append((start, end, name))

        return names

    def write(self, data):
        print('''\
struct Block
{
  gunichar start;
  gunichar end;
  const char *name;
};''')
        print('static const struct Block all_blocks[] =\n  {')
        s = ''
        offset = 0
        for start, end, name in data:
            print('    {{ 0x{0}, 0x{1}, "{2}" }},'.format(start, end, name))
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
