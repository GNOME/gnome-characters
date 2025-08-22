#!/usr/bin/python3

# Input: https://unicode.org/Public/emoji/5.0/emoji-test.txt

import io
from collections import defaultdict
from generator_utils import EmojiDataParser

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
    'Flags': 'flags',
    # Synthetic
    'Singular': 'singular',
}

class Builder(object):
    def __init__(self):
        pass

    def sort_data(self, data):
        group = []
        indices = []

        data.sort()

        for sequence, name, index in data:
            group.append((sequence, name))
            indices.append(index)

        indices = sorted(range(len(indices)), key=indices.__getitem__)

        return group, indices

    def read(self, infile):
        parser = EmojiDataParser(infile.name)
        emojis = parser.by_codepoint()

        data = []
        max_length = 0

        for index, emoji in enumerate(emojis):
            sequence = emoji.codepoints.values
            max_length = max(max_length, len(sequence))
            name = emoji.name

            data.append((sequence, name, index))

        groups_data = defaultdict(list)
        for group_name in GROUPS.keys():
            for index in parser.get_group(group_name):
              groups_data[group_name].append(index)

        # Make a synthetic group of non-composite emoji
        singular_indices = []
        for index, (sequence, _, _) in enumerate(data):
            if len(sequence) == 1:
                singular_indices.append(index)

        groups_data['Singular'] = singular_indices

        return data, groups_data, max_length

    def write(self, data):
        data, groups, max_length = data

        print('''\
#include <glib.h>
#include <stddef.h>

#define EMOJI_SEQUENCE_LENGTH {}
struct EmojiCharacter
{{
  const gunichar uc[{}];
  int length;
  const char *name;
}};'''.format(max_length, max_length))

        print('#define EMOJI_CHARACTER_COUNT {}'.format(
            len(data)))
        print('static const struct EmojiCharacter emoji_characters[{}] ='.format(
            len(data)))
        print('{')

        for sequence, charname, _ in data:
            print('  { { ', end='')
            print(', '.join(['0x{0:X}'.format(char) for char in sequence]), end='')
            print(' }}, {0}, "{1}" }},'.format(len(sequence), charname))

        print('};')
        print()

        for name, group in groups.items():
            if len(group) == 0:
                continue

            print('#define EMOJI_{}_CHARACTER_COUNT {}'.format(
                GROUPS[name].upper(), len(group)))

            print('static const size_t emoji_{}_characters[{}] ='.format(
                GROUPS[name], len(group)))
            print('{')

            for i in range(0, len(group), 10):
                chunk = group[i:i+10]
                s = '  ' + ', '.join('%d' % x for x in chunk)
                if i + 10 < len(group):
                    s += ','
                print(s)

            print('};')
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
