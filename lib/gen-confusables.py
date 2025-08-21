#!/usr/bin/python3

# Input: http://www.unicode.org/Public/security/9.0.0/confusables.txt

import io
import re

class Builder(object):
    def __init__(self):
        pass

    def read(self, infile):
        classes = []
        for line in infile:
            if line.startswith('#'):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            (source, target, _type) = line.split(';', 2)
            source = int(source.strip(), 16)
            target = [int(x, 16) for x in re.split(r'\s+', target.strip())]
            if len(target) > 1:
                continue
            source_classes = [c for c in classes if source in c]
            if len(source_classes) > 0:
                source_classes[0].add(target[0])
            else:
                target_classes = [c for c in classes if target[0] in c]
                if len(target_classes) > 0:
                    target_classes[0].add(source)
                else:
                    c = set()
                    c.add(source)
                    c.add(target[0])
                    classes.append(c)
        return classes

    def write(self, data):
        classes = []
        character_to_class = {}
        print('''\
#include <stdint.h>

static const uint32_t confusable_characters[] =
{''')
        offset = 0
        all_chars = []
        for index, characters in enumerate(data):
            sorted_chars = sorted(characters)
            all_chars.extend(sorted_chars)
            for c in sorted_chars:
                character_to_class[c] = index
            classes.append((offset, len(sorted_chars)))
            offset += len(sorted_chars)

        formatted = ['0x%X' % c for c in all_chars]
        output = ', '.join(formatted)

        while output:
            if len(output) <= 76:
                print('  ' + output)
                break
            split_point = output.rfind(', ', 0, 77)
            if split_point == -1:
                split_point = output.find(', ', 77)
            print('  ' + output[:split_point + 1])
            output = output[split_point + 2:]
        print('};')
        print()
        print('struct ConfusableClass')
        print('{')
        print('  uint16_t offset;')
        print('  uint16_t length;')
        print('};')
        print('static const struct ConfusableClass confusable_classes[] =')
        print('{')
        for offset, length in classes:
            print('  { %d, %d },' % (offset, length))
        print('};')
        print()
        print('struct ConfusableCharacterClass')
        print('{')
        print('  uint32_t uc;')
        print('  uint16_t index;')
        print('};')
        print('static const struct ConfusableCharacterClass confusable_character_classes[] =')
        print('{')
        for character, index in sorted(character_to_class.items(),
                                       key=lambda x: x[0]):
            print('  { 0x%X, %d },' % (character, index))
        print('};')
            

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
