#!/usr/bin/python3

# Input: https://www.unicode.org/Public/UNIDATA/Jamo.txt


class Builder:
    def __init__(self):
        pass

    def read(self, infile):
        chars = []
        for line in infile:
            if line.startswith("#"):
                continue
            line = line.strip()
            if len(line) == 0:
                continue
            data, _comment = line.split("#", 2)
            codepoint, short_name = data.split(";")
            short_name = short_name.strip()

            chars.append((codepoint, short_name))

        return chars

    def write(self, data):
        print("""\
#include <glib.h>

struct HangulCharacter
{
  gunichar uc;
  const char *short_name;
};""")
        print("static const struct HangulCharacter hangul_chars[] =")
        print("{")
        for codepoint, short_name in data:
            print(f'  {{ 0x{codepoint}, "{short_name}" }},')
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
