#!/usr/bin/python3

# Input: https://unicode.org/Public/emoji/5.0/emoji-test.txt

import re

GROUPS = {
    "Smileys & Emotion": "smileys",
    "People & Body": "people",
    "Component": "component",
    "Animals & Nature": "animals",
    "Food & Drink": "food",
    "Travel & Places": "travel",
    "Activities": "activities",
    "Objects": "objects",
    "Symbols": "symbols",
    "Flags": "flags",
    # Synthetic
    "Singular": "singular",
}


class Builder:
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
        data = []
        groups = []
        group_name = None
        group_start = 0
        max_length = 0
        index = 0
        for line in infile:
            m = re.match(r"# group: (.*)", line)
            if m:
                if group_name:
                    groups.append((group_name, group_start))

                group_name = m.group(1)
                group_start = index
            if line.startswith("#"):
                continue
            line = line.strip()
            if len(line) == 0:
                continue

            m = re.match(r"([0-9A-F ]+); fully-qualified\s+#.*E\d+.\d+ (.+)", line)
            if not m:
                continue

            cp = m.group(1).strip()
            sequence = [int(c, 16) for c in cp.split(" ")]
            max_length = max(max_length, len(sequence))

            name = m.group(2).strip().upper()

            data.append((sequence, name, index))
            index += 1

        groups.append((group_name, group_start))

        for i in range(len(groups) - 1):
            groups[i] = (*groups[i], groups[i + 1][1])
        groups[-1] = (*groups[-1], len(data))

        data.sort()

        indices = []
        for sequence, name, index in data:
            indices.append(index)

        groups_data = []
        for name, start, end in groups:
            group_indices = [indices.index(i) for i in indices if start <= i < end]
            group_indices = sorted(group_indices, key=indices.__getitem__)

            groups_data.append((name, group_indices))

        # Make a synthetic group of non-composite emoji
        singular_indices = []
        index = 0
        for sequence, _, _ in data:
            if len(sequence) == 1:
                singular_indices.append(index)
            index += 1

        groups_data.append(("Singular", singular_indices))

        return data, groups_data, max_length

    def write(self, data):
        data, groups, max_length = data

        print(f"""\
#include <glib.h>
#include <stddef.h>

#define EMOJI_SEQUENCE_LENGTH {max_length}
struct EmojiCharacter
{{
  const gunichar uc[{max_length}];
  int length;
  const char *name;
}};""")

        print(f"#define EMOJI_CHARACTER_COUNT {len(data)}")
        print(f"static const struct EmojiCharacter emoji_characters[{len(data)}] =")
        print("{")

        for sequence, charname, _ in data:
            print("  { { ", end="")
            print(", ".join([f"0x{char:X}" for char in sequence]), end="")
            print(f' }}, {len(sequence)}, "{charname}" }},')

        print("};")
        print()

        for name, group in groups:
            if len(group) == 0:
                continue

            print(f"#define EMOJI_{GROUPS[name].upper()}_CHARACTER_COUNT {len(group)}")

            print(
                f"static const size_t emoji_{GROUPS[name]}_characters[{len(group)}] ="
            )
            print("{")

            for i in range(0, len(group), 10):
                chunk = group[i : i + 10]
                s = "  " + ", ".join(f"{x}" for x in chunk)
                if i + 10 < len(group):
                    s += ","
                print(s)

            print("};")
            print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="build")
    parser.add_argument(
        "infile", type=argparse.FileType("r", encoding="utf_8_sig"), help="input file"
    )
    args = parser.parse_args()

    builder = Builder()
    data = builder.read(args.infile)
    builder.write(data)
