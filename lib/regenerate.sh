#!/bin/bash

CLDR_VERSION=27
UCD_VERSION=9.0.0
EMOJI_VERSION=5.0

wget -c "https://www.unicode.org/Public/$UCD_VERSION/ucd/Blocks.txt"
wget -c "https://www.unicode.org/Public/$UCD_VERSION/ucd/Jamo.txt"
wget -c "https://www.unicode.org/Public/$UCD_VERSION/ucd/PropertyValueAliases.txt"
wget -c "https://www.unicode.org/Public/$UCD_VERSION/ucd/UnicodeData.txt"
wget -c "https://www.unicode.org/Public/cldr/$CLDR_VERSION/core.zip"
wget -c "https://www.unicode.org/Public/emoji/$EMOJI_VERSION/emoji-test.txt"
wget -c "https://www.unicode.org/Public/security/$UCD_VERSION/confusables.txt"

unzip -jo core.zip common/supplemental/supplementalData.xml

./gen-blocks.py Blocks.txt > blocks.h
./gen-confusables.py confusables.txt > confusables.h
./gen-emoji.py emoji-test.txt > emoji.h
./gen-hangul.py Jamo.txt > hangul.h
./gen-names.py UnicodeData.txt > names.h
./gen-scripts.py supplementalData.xml PropertyValueAliases.txt > scripts.h
