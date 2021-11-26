#!/usr/bin/python3

# Input: https://unicode.org/Public/emoji/5.0/emoji-test.txt

import io
import re

GROUPS = {
    'Smileys & Emotion': 'smileys',
    'People & Body': 'people',
    'Component': 'component',
    'Animals & Nature': 'animals',
    'Food & Drink': 'food',
    'Travel & Places': 'travel',
    'Activities': 'activities',
    'Objects': 'objects',
    'Symbols': 'symbols',
    'Flags': 'flags'
}

class Builder(object):
    def __init__(self):
        pass

    def read(self, infile):
        group = None
        groups = dict()
        for line in infile:
            m = re.match('# group: (.*)', line)
            if m:
                groups[m.group(1)] = group = set()
            if line.startswith('#'):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            (cp, status) = line.split(';', 1)
            cp = cp.strip()
            if cp.find(' ') > 0:
                continue
            status = status.strip();
            if not status.startswith('fully-qualified'):
                continue
            group.add(int(cp, 16))
        return groups

    def write(self, groups):
        for name, group in groups.items():
            if len(group) == 0:
                continue

            print('#define EMOJI_{}_CHARACTER_COUNT {}'.format(
                GROUPS[name].upper(), len(group)))
            print('static const uint32_t emoji_{}_characters[{}] ='.format(
                GROUPS[name], len(group)))
            print('  {')
            print('    ', end='')
            s = ''
            for index, cp in enumerate(sorted(group)):
                s += '0x%X, ' % cp
                if len(s) > 60:
                    print(s)
                    print('    ', end='')
                    s = ''
            print(s)
            print('  };')
            print()

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
