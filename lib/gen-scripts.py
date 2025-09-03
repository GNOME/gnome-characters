#!/usr/bin/python3

# Usage: gen-scripts.py --cldrinfile .../supplementalData.xml \
#                       --ucdinfile .../PropertyValueAliases.txt
#
# The latest sources can be found at:
# https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml
# http://www.unicode.org/Public/UCD/latest/ucd/PropertyValueAliases.txt

import re
import xml.etree.ElementTree as ET

ISO_ALIASES = {"Hans": ["Hani"], "Hant": ["Hani"], "Jpan": ["Hrkt"], "Kore": ["Hang"]}
UCD_ALIASES = {"Katakana_Or_Hiragana": ["Katakana", "Hiragana"]}


def iso15924_to_hex(iso):
    return hex(ord(iso[0]) << 24 | ord(iso[1]) << 16 | ord(iso[2]) << 8 | ord(iso[3]))


DEFAULT_ALIASES = {"en": (["Latin"], [iso15924_to_hex("Latn")])}


def get_language_data(infile, aliases):
    result = {}
    tree = ET.parse(infile)
    for data in tree.findall("languageData"):
        for lang in data.findall("language"):
            type = lang.get("type")
            scripts = lang.get("scripts")
            if not scripts:
                continue
            territories = lang.get("territories")
            keys = []
            if territories:
                for territory in territories.split(" "):
                    keys.append(f"{type}_{territory}")
            else:
                keys.append(type)

            scripts = scripts.split(" ")

            # Resolve aliases of the ISO 15924 codes.
            scripts = [ISO_ALIASES.get(script, [script]) for script in scripts]
            scripts = [script for elements in scripts for script in elements]

            iso15924 = scripts

            # Resolve ISO 15924 to Unicode mapping.
            scripts = [aliases[script] for script in scripts if script in aliases]

            # Resolve aliases of Unicode script names.
            scripts = [UCD_ALIASES.get(script, [script]) for script in scripts]
            scripts = [script for elements in scripts for script in elements]

            scripts = set(scripts)
            scripts = sorted(scripts)

            iso15924 = [iso15924_to_hex(iso) for iso in iso15924]
            iso15924 = sorted(set(iso15924))

            if len(scripts) == 0:
                continue
            for key in keys:
                result[key] = scripts, iso15924
    temp = dict(DEFAULT_ALIASES)
    temp.update(result)
    return temp


def get_aliases(infile):
    result = {}
    for line in infile:
        if not line.startswith("sc"):
            continue
        (sc, iso, ucd, *comment) = re.split(r"\s*;\s*", line.strip())
        result[iso] = ucd
    return result


def build_header(data):
    max_scripts = max([len(v[0]) for v in data.values()]) + 1
    max_iso = max([len(v[1]) for v in data.values()]) + 1
    print(f"""\
#include <glib.h>
#include <glib/gi18n.h>

#define NLANGUAGES {len(data)}
struct LanguageScripts
{{
  const gchar *language;
  const gchar *scripts[{max_scripts}];
  const guint32 iso15924[{max_iso}];
}};""")
    print("struct LanguageScripts language_scripts[NLANGUAGES] =")
    print("{")
    for index, (lang, (scripts, iso15924)) in enumerate(
        sorted(data.items(), key=lambda x: x[0])
    ):
        scripts_array = ", ".join([f'N_("{script}")' for script in scripts] + ["NULL"])
        iso15924_array = ", ".join([f"{iso}" for iso in iso15924] + ["0"])
        print(
            f'  {{ "{lang}", {{ {scripts_array} }}, {{ {iso15924_array} }} }}', end=""
        )
        if index + 1 < len(data):
            print(",")
        else:
            print("")
    print("};")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="build")
    parser.add_argument(
        "cldrinfile", type=argparse.FileType("r"), help="CLDR input file"
    )
    parser.add_argument(
        "ucdinfile",
        type=argparse.FileType("r", encoding="utf_8_sig"),
        help="UCD input file",
    )
    args = parser.parse_args()

    aliases = get_aliases(args.ucdinfile)
    data = get_language_data(args.cldrinfile, aliases)
    build_header(data)
