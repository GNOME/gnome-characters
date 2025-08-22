"""Common utilities for emoji data generation scripts.

This module provides shared functionality for parsing Unicode emoji data files,
ensuring consistent processing across different generator scripts.
"""

from __future__ import annotations

import json
import re
import textwrap
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, TextIO

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator


@dataclass
class CodepointSequence:
    """Unicode codepoint sequence for debug output in generated C comments."""

    values: list[int]

    def __str__(self) -> str:
        """Return string representation of codepoint sequence."""
        return " ".join(f"U+{cp:04X}" for cp in self.values)

    def __lt__(self, other: CodepointSequence) -> bool:
        """Compare codepoint sequences for sorting."""
        return self.values < other.values

    def __iter__(self) -> Iterator[int]:
        """Return iterator over codepoint values."""
        return iter(self.values)

    def __len__(self) -> int:
        """Return number of codepoints in sequence."""
        return len(self.values)

    def __getitem__(self, index: int) -> int:
        """Get codepoint at given index.

        Args:
            index: The index of the codepoint to retrieve.

        Returns:
            The codepoint value at the specified index.

        """
        return self.values[index]


@dataclass
class Emoji:
    """Represents a single emoji with its metadata."""

    codepoints: CodepointSequence
    name: str
    group: str | None

    def __init__(
        self,
        codepoints: CodepointSequence | list[int],
        name: str,
        group: str | None,
    ) -> None:
        """Initialise emoji with codepoints, name, and group.

        Args:
            codepoints: Unicode codepoint sequence or list of integers.
            name: The name of the emoji.
            group: The group this emoji belongs to.
        """
        if isinstance(codepoints, CodepointSequence):
            self.codepoints = codepoints
        else:
            self.codepoints = CodepointSequence(list(codepoints))

        self.name = name.upper()
        self.group = group

    def __lt__(self, other: Emoji) -> bool:
        """Compare emojis by codepoint sequence, then by name."""
        return (self.codepoints.values, self.name) < (
            other.codepoints.values,
            other.name,
        )

    @property
    def utf8(self) -> str:
        """Convert codepoints to UTF-8 string."""
        return "".join(chr(cp) for cp in self.codepoints)

    @property
    def c_array(self) -> str:
        """Format codepoints as C array initializer."""
        formatted = ", ".join(f"0x{cp:X}" for cp in self.codepoints)
        return f"{{ {formatted} }}"

    @property
    def escaped_name(self) -> str:
        """Escape name for use in C string literal."""
        return self.name.replace("\\", "\\\\").replace('"', '\\"')


class EmojiDataParser:
    """Parser for Unicode emoji-test.txt files."""

    def __init__(self, file_path: str) -> None:
        """Initialize parser with file path.

        Args:
            file_path: Path to emoji-test.txt file
        """
        self.file_path = file_path
        with Path(self.file_path).open(encoding="utf-8") as f:
            self._emojis = list(self._parse_content(f))

    def by_codepoint(self) -> Iterator[Emoji]:
        """Yield emojis sorted by codepoint sequence."""
        yield from sorted(self._emojis)

    def get_group(self, group_name: str) -> Iterator[int]:
        """Return sorted indices of emojis in the given group in file order."""
        # Create mapping from original position to sorted position
        orig_to_sorted = {
            orig_idx: sorted_idx
            for sorted_idx, (orig_idx, _) in enumerate(
                sorted(enumerate(self._emojis), key=lambda x: x[1]),
            )
        }

        return (
            orig_to_sorted[orig_idx]
            for orig_idx, emoji in enumerate(self._emojis)
            if emoji.group == group_name
        )

    def _parse_content(self, file_handle: TextIO) -> Iterator[Emoji]:
        """Parse emoji-test.txt content and yield Emoji objects.

        Args:
            file_handle: File handle to read from

        Yields:
            Emoji objects in parse order

        """
        current_group = None

        for line in file_handle:
            # Check for group markers
            if line.startswith("# group:"):
                group_name = line[9:].strip()
                current_group = group_name
                continue

            # Skip comments and empty lines
            if line.startswith("#") or not line.strip():
                continue

            # Match fully-qualified emoji lines
            # Format: "263A FE0F      ; fully-qualified     # ☺️ E0.6 smiling face"  # noqa: E501, ERA001
            m = re.match(r"([0-9A-F ]+); fully-qualified\s+#.*E\d+\.\d+ (.+)", line)
            if not m:
                continue

            codepoints_str = m.group(1).strip()
            name = normalize_and_collapse_whitespace(m.group(2))
            codepoints = [int(cp, 16) for cp in codepoints_str.split()]

            yield Emoji(
                codepoints=codepoints,
                name=name,
                group=current_group,
            )


def to_c_comment(
    text: str,
    width: int = 80,
) -> str:
    """Convert text into a GTKDoc-style C block comment.

    This function wraps prose to the given width, and preserves Markdown-style
    lists with proper hanging indentation.

    Args:
        text: The input text to convert.
        width: Maximum line width including the comment prefix.

    Returns:
        A formatted C-style block comment string.

    Raises:
        ValueError: If the width is less than or equal to the prefix length.

    """
    prefix = " * "

    if width <= len(prefix):
        msg = "Width must be greater than PREFIX length"
        raise ValueError(msg)

    text_width = width - len(prefix)

    def is_list_item(line: str) -> tuple[bool, str, str]:
        """Check if a line is a Markdown-style list item."""
        stripped = line.lstrip()

        # Unordered list markers
        if stripped.startswith(("- ", "* ", "+ ")):
            return True, stripped[:2], stripped[2:].lstrip()

        i = 0
        while i < len(stripped) and stripped[i].isdigit():
            i += 1

        if (
            i > 0
            and i < len(stripped)
            and stripped[i] == "."
            and i + 1 < len(stripped)
            and stripped[i + 1] == " "
        ):
            bullet = stripped[: i + 2]  # e.g. "12. "
            rest = stripped[i + 2 :].lstrip()
            return True, bullet, rest

        return False, "", ""

    def wrap_prose(paragraph: str) -> list[str]:
        """Wrap a paragraph of prose to the available width."""
        cleaned = " ".join(paragraph.split())

        return textwrap.wrap(cleaned, width=text_width)

    def wrap_list_item(bullet: str, content: str) -> list[str]:
        """Wrap a Markdown-style list item with hanging indent."""
        indent = " " * len(bullet)
        wrapper = textwrap.TextWrapper(
            width=text_width,
            initial_indent=bullet,
            subsequent_indent=indent,
        )

        return wrapper.wrap(content)

    lines = text.splitlines()
    wrapped_lines: list[str] = []

    buffer: list[str] = []
    in_list = False
    current_bullet = ""
    current_item: list[str] = []

    def flush_prose() -> None:
        nonlocal buffer
        if not buffer:
            return

        paragraph = " ".join(buffer)
        wrapped_lines.extend(wrap_prose(paragraph))
        buffer.clear()

    def flush_list_item() -> None:
        nonlocal current_item, current_bullet

        if not current_item:
            return

        content = " ".join(current_item)
        wrapped_lines.extend(wrap_list_item(current_bullet, content))
        current_item = []
        current_bullet = ""

    for line in lines:
        # Blank line: flush prose or list item
        if not line.strip():
            flush_prose()
            flush_list_item()

            wrapped_lines.append("")
            in_list = False

            continue

        is_list, bullet, rest = is_list_item(line)
        # Starting a new list item
        if is_list:
            flush_prose()
            flush_list_item()
            in_list = True
            current_bullet = bullet
            current_item = [rest]

            continue

        # Continuation of a list item
        if in_list:
            current_item.append(line.strip())
            continue

        # Normal prose
        buffer.append(line.strip())

    flush_prose()
    flush_list_item()

    # Remove leading empty lines
    while wrapped_lines and wrapped_lines[0] == "":
        wrapped_lines.pop(0)

    # Remove trailing empty lines
    while wrapped_lines and wrapped_lines[-1] == "":
        wrapped_lines.pop()

    result = ["/**"]
    for line in wrapped_lines:
        if not line:
            result.append(prefix.rstrip())
        else:
            result.append(f"{prefix}{line}")
    result.append(" */")

    return "\n".join(result)


def normalize_and_collapse_whitespace(text: str) -> str:
    r"""Normalise a Unicode string and collapse runs of whitespace.

    This function combines Unicode normalisation with whitespace normalisation
    in a single operation. It first applies NFKC normalisation to convert
    the string into canonical form, standardising compatibility characters
    (such as ligatures and superscripts) to their standard forms. It then
    collapses any sequence of Unicode whitespace characters into a single
    ASCII space character and trims leading and trailing whitespace.

    Unicode whitespace characters include not only ASCII spaces, tabs, and
    newlines, but also various Unicode separator characters such as
    non-breaking spaces, em spaces, and line/paragraph separators.

    This is intended to produce the same output as
    `gc_utf8_normalize_and_collapse_whitespace` in `gc.c`, so we can compare
    Unicode strings typed as search terms with those in `emoji-data.txt` and
    `annotations.json`.

    Args:
        text: A Unicode string to normalise and collapse whitespace in

    Returns:
        A normalised string with collapsed whitespace

    Examples:
        >>> normalize_and_collapse_whitespace("  hello\\u2000\\u2001world\\t\\n  ")
        "hello world"
        >>> normalize_and_collapse_whitespace("   ")
        ""
        >>> normalize_and_collapse_whitespace("café\\u0301")  # é + combining accent
        "café"
    """
    # First normalise the Unicode characters using NFKC (same as G_NORMALIZE_ALL)
    normalised = unicodedata.normalize("NFKC", text)

    collapsed = re.sub(r"\s+", " ", normalised)

    return collapsed.strip()


type JSONScalar = str | int | float | bool | None
type JSONObject = dict[str, JSONValue]
type JSONArray = list[JSONValue]
type JSONValue = JSONScalar | JSONObject | JSONArray


class NormalizingJSONDecoder(json.JSONDecoder):
    """A JSON decoder that normalises all string values using a provided function.

    This decoder behaves like the standard ``json.JSONDecoder`` but applies
    a normalisation function to every string value in the decoded JSON
    structure. Keys are left untouched.

    Example:
        >>> data = '{"name": "   Alice   ", "tags": ["  hello ", " world  "]}'
        >>> decoded = json.loads(data, cls=NormalisingJSONDecoder)
        >>> decoded
        {'name': 'Alice', 'tags': ['hello', 'world']}

    Attributes:
        _normaliser: A callable that takes a string and returns a normalised string.
    """

    def __init__(
        self,
        *,
        normaliser: Callable[[str], str] = normalize_and_collapse_whitespace,
        **kwargs: object,
    ) -> None:
        """Initialise the decoder.

        Args:
            normaliser: A function applied to every string value in the JSON.
                Defaults to ``normalize_and_collapse_whitespace``.
            **kwargs: Additional keyword arguments passed to ``json.JSONDecoder``.
        """
        super().__init__(**kwargs)
        self._normaliser = normaliser

    def decode(self, s: str, **kwargs: object) -> JSONValue:
        """Decode a JSON document and normalize all string values.

        Args:
            s: The JSON string to decode.
            **kwargs: Additional keyword arguments.

        Returns:
            The decoded and normalized JSON value.
        """
        obj = super().decode(s, **kwargs)

        return self._process_value(obj)

    def _process_value(self, value: JSONValue) -> JSONValue:
        """Recursively process a JSON value.

        Args:
            value: The JSON value to process.

        Returns:
            The processed value, with strings normalised and nested
            structures traversed.
        """
        if isinstance(value, str):
            return self._normaliser(value)

        if isinstance(value, list):
            return [self._process_value(v) for v in value]

        if isinstance(value, dict):
            return {k: self._process_value(v) for k, v in value.items()}

        return value
