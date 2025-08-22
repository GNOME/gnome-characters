#!/usr/bin/env python3
"""Unit tests for generator_utils module."""

from __future__ import annotations

import json
import tempfile
import textwrap
from pathlib import Path
from textwrap import dedent
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from collections.abc import Generator

from .generator_utils import (
    CodepointSequence,
    Emoji,
    EmojiDataParser,
    NormalizingJSONDecoder,
    normalize_and_collapse_whitespace,
    to_c_comment,
)


class Codepoints:
    """Example codepoints used in tests."""

    BEAMING_FACE = 0x1F601  # 😁
    GRINNING_FACE = 0x1F600  # 😀
    GRINNING_FACE_WITH_BIG_EYES = 0x1F603  # 😃
    LIGHT_SKIN_TONE = 0x1F3FB  # 🏻
    RIGHTWARDS_HAND = 0x1FAF1  # 🫱
    SMILING_FACE = 0x263A  # ☺
    VARIATION_SELECTOR_16 = 0xFE0F  # Emoji presentation selector
    ZERO_WIDTH_JOINER = 0x200D  # ZWJ


class TestCodepointSequence:
    """Tests for CodepointSequence dataclass."""

    @pytest.mark.parametrize(
        "name,values,expected_str,expected_len",
        [
            (
                "single emoji",
                [Codepoints.GRINNING_FACE],
                "U+1F600",
                1,
            ),
            (
                "emoji with variation selector",
                [Codepoints.GRINNING_FACE, Codepoints.VARIATION_SELECTOR_16],
                "U+1F600 U+FE0F",
                2,
            ),
            (
                "emoji with ZWJ sequence",
                [
                    Codepoints.GRINNING_FACE,
                    Codepoints.ZERO_WIDTH_JOINER,
                    Codepoints.BEAMING_FACE,
                ],
                "U+1F600 U+200D U+1F601",
                3,
            ),
            (
                "emoji with skin tone",
                [Codepoints.RIGHTWARDS_HAND, Codepoints.LIGHT_SKIN_TONE],
                "U+1FAF1 U+1F3FB",
                2,
            ),
        ],
        ids=["single_emoji", "with_variation_selector", "with_ZWJ", "with_skin_tone"],
    )
    def test_codepoint_sequences(
        self, name: str, values: list[int], expected_str: str, expected_len: int
    ) -> None:
        """Test codepoints can be converted to strings."""
        seq = CodepointSequence(values)

        assert str(seq) == expected_str
        assert len(seq) == expected_len
        assert list(seq) == values

        # Test indexing
        for i, val in enumerate(values):
            assert seq[i] == val

    def test_comparison(self) -> None:
        """Test comparison operations between sequences."""
        seq1 = CodepointSequence([Codepoints.GRINNING_FACE])
        seq2 = CodepointSequence([Codepoints.BEAMING_FACE])
        seq3 = CodepointSequence(
            [Codepoints.GRINNING_FACE, Codepoints.VARIATION_SELECTOR_16],
        )

        assert seq1 < seq2
        assert seq1 < seq3
        assert seq3 > seq1


class TestEmoji:
    """Tests for Emoji dataclass."""

    @pytest.mark.parametrize(
        "name,codepoints,emoji_name,group,expected_utf8,expected_c_array,expected_escaped_name",
        [
            (
                "simple grinning face",
                [Codepoints.GRINNING_FACE],
                "grinning face",
                "Smileys & Emotion",
                "😀",
                "{ 0x1F600 }",
                "GRINNING FACE",
            ),
            (
                "emoji with variation selector",
                [Codepoints.GRINNING_FACE, Codepoints.VARIATION_SELECTOR_16],
                "grinning face",
                "Smileys & Emotion",
                "😀\ufe0f",
                "{ 0x1F600, 0xFE0F }",
                "GRINNING FACE",
            ),
            (
                "emoji with special characters in name",
                [Codepoints.GRINNING_FACE],
                'face with "quotes" and \\backslash',
                "Test",
                "😀",
                "{ 0x1F600 }",
                'FACE WITH \\"QUOTES\\" AND \\\\BACKSLASH',
            ),
            (
                "emoji with skin tone modifier",
                [Codepoints.RIGHTWARDS_HAND, Codepoints.LIGHT_SKIN_TONE],
                "rightwards hand: light skin tone",
                "People & Body",
                "🫱🏻",
                "{ 0x1FAF1, 0x1F3FB }",
                "RIGHTWARDS HAND: LIGHT SKIN TONE",
            ),
        ],
        ids=[
            "simple_grinning",
            "with_variation_selector",
            "special_chars_in_name",
            "with_skin_tone",
        ],
    )
    def test_emoji_properties(
        self,
        name: str,
        codepoints: list[int],
        emoji_name: str,
        group: str | None,
        expected_utf8: str,
        expected_c_array: str,
        expected_escaped_name: str,
    ) -> None:
        """Test emoji-data.txt can be parsed."""
        emoji = Emoji(
            codepoints=codepoints,
            name=emoji_name,
            group=group,
        )

        # list of ints should be converted to `CodepointSequence`
        assert isinstance(emoji.codepoints, CodepointSequence)
        assert list(emoji.codepoints) == codepoints

        assert emoji.utf8 == expected_utf8
        assert emoji.c_array == expected_c_array
        assert emoji.escaped_name == expected_escaped_name

    def test_emoji_comparison(self) -> None:
        """Test emoji comparison logic."""
        emoji1 = Emoji(
            codepoints=[Codepoints.GRINNING_FACE],
            name="face a",
            group="Test",
        )
        emoji2 = Emoji(
            codepoints=[Codepoints.BEAMING_FACE],
            name="face b",
            group="Test",
        )
        emoji3 = Emoji(
            codepoints=[Codepoints.GRINNING_FACE],
            name="face z",
            group="Test",
        )

        # Different codepoints
        assert emoji1 < emoji2
        # Same codepoints, different names
        assert emoji1 < emoji3


class TestToCComment:
    """Tests for to_c_comment function."""

    @pytest.mark.parametrize(
        "name,input_text,expected_output,width",
        [
            (
                "single line",
                "This is a simple comment.",
                textwrap.dedent("""\
                    /**
                     * This is a simple comment.
                     */"""),
                80,
            ),
            (
                "multiple paragraphs",
                textwrap.dedent("""\
                    First paragraph.

                    Second paragraph."""),
                textwrap.dedent("""\
                    /**
                     * First paragraph.
                     *
                     * Second paragraph.
                     */"""),
                80,
            ),
            (
                "trailing empty lines are removed",
                textwrap.dedent("""\
                    Some content.


                    """),
                textwrap.dedent("""\
                    /**
                     * Some content.
                     */"""),
                80,
            ),
            (
                "unordered list wrapping",
                textwrap.dedent("""\
                    Here's a list:
                    - First item
                    - Second item that is much longer and needs to wrap to multiple lines
                    - Third item"""),  # noqa: E501
                textwrap.dedent("""\
                    /**
                     * Here's a list:
                     * - First item
                     * - Second item that is much longer and needs to
                     *   wrap to multiple lines
                     * - Third item
                     */"""),
                50,
            ),
            (
                "ordered list wrapping",
                textwrap.dedent("""\
                    Steps:
                    1. First step
                    2. Second step that is very long and needs wrapping
                    3. Third step"""),
                textwrap.dedent("""\
                    /**
                     * Steps:
                     * 1. First step
                     * 2. Second step that is very long and needs
                     *    wrapping
                     * 3. Third step
                     */"""),
                50,
            ),
            (
                "ordered list wrapping handles >1 digit number",
                textwrap.dedent("""\
                    Steps:
                    8. Eighth step
                    9. Ninth step that is very long and needs wrapping
                    10. Tenth step which is also very long and must wrap"""),
                textwrap.dedent("""\
                    /**
                     * Steps:
                     * 8. Eighth step
                     * 9. Ninth step that is very long and needs
                     *    wrapping
                     * 10. Tenth step which is also very long and must
                     *     wrap
                     */"""),
                50,
            ),
            (
                "mixed list markers",
                textwrap.dedent("""\
                    Different list types:
                    * Star item
                    + Plus item
                    - Dash item"""),
                textwrap.dedent("""\
                    /**
                     * Different list types:
                     * * Star item
                     * + Plus item
                     * - Dash item
                     */"""),
                80,
            ),
        ],
        ids=[
            "single_line",
            "multiple_paragraphs",
            "trailing_empty_lines",
            "unordered_list_wrapping",
            "ordered_list_wrapping",
            "multi_digit_ordered_list",
            "mixed_list_markers",
        ],
    )
    def test_comment_generation(
        self, name: str, input_text: str, expected_output: str, width: int
    ) -> None:
        """Test comments are wrapped properly."""
        result = to_c_comment(input_text, width=width)
        assert result == expected_output

    def test_width_validation(self) -> None:
        """Test that invalid width raises ValueError."""
        with pytest.raises(ValueError):
            to_c_comment("Test", width=3)  # Too small for prefix " * "


class TestEmojiDataParser:
    """Tests for EmojiDataParser class."""

    @pytest.fixture(autouse=True)
    def setup_and_teardown(self) -> Generator[None, None, None]:
        """Create and cleanup temporary test file."""
        self.temp_file = tempfile.NamedTemporaryFile(  # noqa: SIM115
            mode="w",
            suffix=".txt",
            delete=False,
            encoding="utf-8",
        )

        # Write test emoji data
        self.temp_file.write(
            textwrap.dedent(f"""\
            # emoji-test.txt
            # group: Smileys & Emotion
            {Codepoints.GRINNING_FACE:04X} ; fully-qualified # 😀 E1.0 grinning face
            {Codepoints.SMILING_FACE:04X} ; unqualified # ☺ E0.6 smiling face
            {Codepoints.GRINNING_FACE_WITH_BIG_EYES:04X} ; fully-qualified # 😃 E0.6 grinning face with big eyes

            # group: People & Body
            {Codepoints.RIGHTWARDS_HAND:04X} {Codepoints.LIGHT_SKIN_TONE:04X} ; fully-qualified # 🫱🏻 E14.0 rightwards hand: light skin tone

            """),  # noqa: E501
        )
        self.temp_file.close()
        self.parser = EmojiDataParser(self.temp_file.name)

        # Yield control back to the test
        yield

        # Cleanup after test
        Path(self.temp_file.name).unlink()

    def test_parse_basic(self) -> None:
        """Test basic parsing functionality."""
        emojis = list(self.parser.by_codepoint())

        assert len(emojis) == 3

        # This emoji should be first, since we sort by codepoint
        assert list(emojis[0].codepoints) == [Codepoints.GRINNING_FACE]
        assert emojis[0].name == "GRINNING FACE"
        assert emojis[0].group == "Smileys & Emotion"

    def test_parse_multi_codepoint(self) -> None:
        """Test parsing emoji with multiple codepoints."""
        emojis = self.parser.by_codepoint()

        # Find the emoji with multiple codepoints
        multi_cp_emoji = next(e for e in emojis if len(e.codepoints) > 1)
        assert list(multi_cp_emoji.codepoints) == [
            Codepoints.RIGHTWARDS_HAND,
            Codepoints.LIGHT_SKIN_TONE,
        ]
        assert multi_cp_emoji.name == "RIGHTWARDS HAND: LIGHT SKIN TONE"

    def test_get_group(self) -> None:
        """Test filtering by group."""
        people_indices = list(self.parser.get_group("People & Body"))
        emojis = list(self.parser.by_codepoint())

        assert len(people_indices) == 1
        people_emoji = emojis[people_indices[0]]
        assert people_emoji.name == "RIGHTWARDS HAND: LIGHT SKIN TONE"


class TestNormalizeAndCollapseWhitespace:
    """Tests for normalize_and_collapse_whitespace function."""

    @pytest.mark.parametrize(
        "name,input_text,expected_output",
        [
            (
                "basic whitespace collapse",
                "  hello    world  ",
                "hello world",
            ),
            (
                "mixed whitespace characters",
                "hello\u2000\u2001world\t\n",
                "hello world",
            ),
            (
                "only whitespace",
                "   \t\n\u2000\u2001   ",
                "",
            ),
            (
                "no whitespace",
                "helloworld",
                "helloworld",
            ),
            (
                "unicode normalization with combining characters",
                "café\u0301",  # café with additional combining acute accent
                "café́",  # NFKC form keeps the additional accent
            ),
            (
                "unicode normalization with ligatures",
                "ﬁle",  # fi ligature
                "file",
            ),
            (
                "non-breaking spaces and em spaces",
                "hello\u00a0\u2003world",
                "hello world",
            ),
            (
                "line and paragraph separators",
                "hello\u2028world\u2029test",
                "hello world test",
            ),
            (
                "multiple consecutive different whitespace types",
                "a\t\n\u2000\u00a0\u2003b",
                "a b",
            ),
            (
                "empty string",
                "",
                "",
            ),
        ],
        ids=[
            "basic_collapse",
            "mixed_whitespace",
            "only_whitespace",
            "no_whitespace",
            "unicode_combining",
            "unicode_ligatures",
            "nbsp_and_em_spaces",
            "line_para_separators",
            "multiple_ws_types",
            "empty_string",
        ],
    )
    def test_whitespace_normalization(
        self, name: str, input_text: str, expected_output: str
    ) -> None:
        """Test whitespace normalization and Unicode handling."""
        result = normalize_and_collapse_whitespace(input_text)
        assert result == expected_output

    def test_type_validation(self) -> None:
        """Test that non-string input raises TypeError."""
        with pytest.raises(TypeError):
            normalize_and_collapse_whitespace(123)  # type: ignore[arg-type]

        with pytest.raises(TypeError):
            normalize_and_collapse_whitespace(None)  # type: ignore[arg-type]


class TestNormalizingJSONDecoder:
    """Tests for NormalizingJSONDecoder class."""

    @pytest.mark.parametrize(
        "name,input_json,expected_output",
        [
            (
                "simple object with whitespace",
                '{"name": "  Alice  ", "age": 30}',
                {"name": "Alice", "age": 30},
            ),
            (
                "nested objects",
                dedent("""\
                {"user": {"name": "  Bob\\t", "email": "bob@example.com  "}}
                """),
                {"user": {"name": "Bob", "email": "bob@example.com"}},
            ),
            (
                "array of strings",
                '["  hello ", " world\\n", "\\tfoo\\tbar\\t"]',
                ["hello", "world", "foo bar"],
            ),
            (
                "mixed nested structure",
                """{
                    "title": "  My Document  ",
                    "tags": ["  python ", " testing\\n"],
                    "metadata": {
                        "author": "Jane\\tDoe",
                        "version": 1.0
                    }
                }""",
                {
                    "title": "My Document",
                    "tags": ["python", "testing"],
                    "metadata": {"author": "Jane Doe", "version": 1.0},
                },
            ),
            (
                "unicode whitespace normalization",
                '{"text": "hello\\u2000\\u2001world"}',
                {"text": "hello world"},
            ),
            (
                "preserves non-string types",
                dedent("""\
                {
                    "string": "  test  ",
                    "number": 42,
                    "float": 3.14,
                    "bool": true,
                    "null": null
                }
                """).strip(),
                {
                    "string": "test",
                    "number": 42,
                    "float": 3.14,
                    "bool": True,
                    "null": None,
                },
            ),
            (
                "empty strings",
                '{"empty": "", "whitespace_only": "   \\t\\n  "}',
                {"empty": "", "whitespace_only": ""},
            ),
            (
                "array with mixed types",
                '["  string  ", 123, true, null, {"nested": "  value  "}]',
                ["string", 123, True, None, {"nested": "value"}],
            ),
            (
                "unicode normalization in JSON",
                '{"text": "café\\u0301", "ligature": "ﬁle"}',
                {"text": "café́", "ligature": "file"},
            ),
        ],
        ids=[
            "simple_object",
            "nested_objects",
            "array_of_strings",
            "mixed_nested",
            "unicode_whitespace",
            "preserves_types",
            "empty_strings",
            "array_mixed_types",
            "unicode_normalization",
        ],
    )
    def test_json_normalization(
        self, name: str, input_json: str, expected_output: dict | list
    ) -> None:
        """Test JSON decoding with string normalization."""
        result = json.loads(input_json, cls=NormalizingJSONDecoder)
        assert expected_output == result

    def test_custom_normalizer(self) -> None:
        """Test using a custom normalizer function."""

        def uppercase_normalizer(text: str) -> str:
            """Convert to uppercase and strip whitespace."""
            return text.strip().upper()

        input_json = '{"name": "  alice  ", "city": "  wonderland  "}'
        expected = {"name": "ALICE", "city": "WONDERLAND"}

        result = json.loads(
            input_json,
            cls=NormalizingJSONDecoder,
            normaliser=uppercase_normalizer,
        )
        assert result == expected

    def test_deeply_nested_structure(self) -> None:
        """Test normalization in deeply nested structures."""
        input_json = """{
            "level1": {
                "level2": {
                    "level3": {
                        "level4": {
                            "text": "  deeply nested  "
                        }
                    }
                }
            }
        }"""

        result = json.loads(input_json, cls=NormalizingJSONDecoder)
        assert result["level1"]["level2"]["level3"]["level4"]["text"] == "deeply nested"

    def test_keys_not_normalized(self) -> None:
        """Test that object keys are not normalized."""
        input_json = '{"  key with spaces  ": "  value  "}'
        result = json.loads(input_json, cls=NormalizingJSONDecoder)

        # Key should remain unchanged, only value normalized
        assert "  key with spaces  " in result
        assert result["  key with spaces  "] == "value"

    @pytest.mark.parametrize(
        "input_json,expected",
        [
            ("{}", {}),
            ("[]", []),
            ('{"empty_obj": {}, "empty_arr": []}', {"empty_obj": {}, "empty_arr": []}),
        ],
        ids=["empty_object", "empty_array", "nested_empty_containers"],
    )
    def test_empty_containers(self, input_json: str, expected: dict | list) -> None:
        """Test empty objects and arrays."""
        result = json.loads(input_json, cls=NormalizingJSONDecoder)
        assert result == expected

    def test_decoder_with_other_json_options(self) -> None:
        """Test that decoder works with other json.loads options."""
        # Test with strict=False to allow control characters
        input_json = '{"text": "  hello\\nworld  "}'
        result = json.loads(input_json, cls=NormalizingJSONDecoder, strict=False)
        assert result == {"text": "hello world"}
