#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/Blocks.txt


class Builder:
    def __init__(self):
        pass

    def read(self, infile):
        names = []
        for line in infile:
            if line.startswith("#"):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            range, name = line.split(";", 2)
            start, end = range.split("..")
            name = name.lstrip()

            names.append((start, end, name))

        return names

    def write(self, data):
        print("""\
#include <glib.h>

struct Block
{
  gunichar start;
  gunichar end;
  const char *name;
};""")
        print("static const struct Block all_blocks[] =")
        print("{")
        for start, end, name in data:
            print(f'  {{ 0x{start}, 0x{end}, "{name}" }},')
        print("};")


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
