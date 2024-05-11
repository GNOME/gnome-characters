#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/UnicodeData.txt

import io
import re

class Builder(object):
    def __init__(self):
        pass

    def read(self, ucdfile, emojifile):
        emoji = set()
        for line in emojifile:
            m = re.match(r'([0-9A-F ]+); fully-qualified\s+#.*E\d+.\d+ (.+)', line)

            if not m:
                continue

            cp = m.group(1).strip()
            if cp.find(' ') > 0:
                continue

            emoji.add(int(cp, 16))

        names = []
        for line in ucdfile:
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

            cp = int(codepoint, 16)
            if cp in emoji:
                emoji.remove(cp)
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
    parser.add_argument('ucdfile', type=argparse.FileType('r'),
                        help='UnicodeData.txt')
    parser.add_argument('emojifile', type=argparse.FileType('r'),
                        help='emoji-test.txt')
    args = parser.parse_args()

    builder = Builder()
    # FIXME: argparse.FileType(encoding=...) is available since Python 3.4
    data = builder.read(io.open(args.ucdfile.name, encoding='utf_8_sig'), io.open(args.emojifile.name, encoding='utf_8_sig'))
    builder.write(data)
