#!/bin/bash

CLDR_VERSION=47
UNICODE_VERSION=17.0.0

wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/ucd/Blocks.txt"
wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/ucd/Jamo.txt"
wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/ucd/PropertyValueAliases.txt"
wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/ucd/UnicodeData.txt"
wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/emoji/emoji-test.txt"
wget -c "https://www.unicode.org/Public/$UNICODE_VERSION/security/confusables.txt"
wget -c "https://www.unicode.org/Public/cldr/$CLDR_VERSION/core.zip"

unzip -jo core.zip common/supplemental/supplementalData.xml
unzip -jo core.zip common/supplemental/supplementalMetadata.xml

./gen-blocks.py Blocks.txt > blocks.h
./gen-confusables.py confusables.txt > confusables.h
./gen-emoji.py emoji-test.txt > emoji.h
./gen-hangul.py Jamo.txt > hangul.h
./gen-languages.py supplementalMetadata.xml > languages.h
./gen-names.py UnicodeData.txt emoji-test.txt > names.h
./gen-scripts.py supplementalData.xml PropertyValueAliases.txt > scripts.h

rm Blocks.txt
rm Jamo.txt
rm PropertyValueAliases.txt
rm UnicodeData.txt
rm core.zip
rm supplementalData.xml
rm supplementalMetadata.xml
rm emoji-test.txt
rm confusables.txt