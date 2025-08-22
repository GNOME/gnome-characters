#!/usr/bin/env python3
"""CLDR/Emoji Trie C Header Generator.

This module generates a prefix trie data structure for efficient character/emoji
keyword search with O(k) lookup time where k is the length of the search term.
The trie enables real-time prefix matching as users type, with ranked search
results based on keyword relevance and source priority.

The system processes both Unicode emoji data and CLDR annotations for comprehensive
character coverage including punctuation, symbols, and emoji. Each character/emoji
can be found through multiple paths: technical names, CLDR keywords, TTS names,
and tokenised words from multi-word phrases.

Data Structures (C side):
- TrieNode: Each node represents a prefix state containing item indices reachable
            from that prefix and references to child nodes for extending the search
- TrieChild: Each edge represents a single character transition, with edges sorted
             by character code to enable efficient binary search
- MatchEntry: (item_index, flags) per node, describing how that item relates to
              the prefix (from CLDR/name/token, full phrase end, exact end)

The implementation uses flattened arrays for space efficiency in the generated C
code, with each node referencing contiguous sections using offset and count pairs.

Input: emoji-test.txt and CLDR annotations.json files
Output: character-trie.h containing C data structures for runtime search
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import textwrap
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import IntFlag
from pathlib import Path
from typing import TYPE_CHECKING, ClassVar

import gi

gi.require_version("GLib", "2.0")
from gi.repository import GLib  # noqa:E402

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

from generator_utils import (  # noqa: E402
    CodepointSequence,
    Emoji,
    EmojiDataParser,
    NormalizingJSONDecoder,
    to_c_comment,
)

INDICES_PER_ROW = 8  # Number of entries per row in C array comments
MIN_PRINTABLE_CHAR = 32  # First printable ASCII character
MAX_UNICODE_CODEPOINT = 0x10FFFF  # Maximum valid Unicode codepoint
MAX_UNICODE_BMP = 0xFFFF  # Maximum codepoint in Unicode Basic Multilingual Plane


@dataclass
class CStructureMemberSpec:
    """A single member field in a C structure definition."""

    type_name: str
    field_name: str
    comment: str

    def __str__(self) -> str:
        """Render the member as a struct field with GTKDoc comment."""
        return f"  {self.type_name} {self.field_name};  /**< {self.comment} */"


@dataclass
class CommentEntry:
    """A comment line in the C array."""

    text: str

    def __str__(self) -> str:
        """Render a C comment."""
        return f"/* {self.text} */"


@dataclass
class CStructure(ABC):
    """A C array structure."""

    name: ClassVar[str]
    array_name: ClassVar[str]
    description: ClassVar[str]
    members: ClassVar[list[CStructureMemberSpec]]

    @property
    @abstractmethod
    def entries(self) -> list:
        """Data entries for the array."""

    @property
    def entries_count(self) -> int:
        """Get the count of actual data entries."""
        return len(self.entries)

    def type_definition(self) -> str:
        """Generate the C struct typedef with documentation."""
        struct_comment = to_c_comment(f"{self.name}:\n\n{self.description}")

        raw_decls = [f"  {m.type_name} {m.field_name};" for m in self.members]
        max_len = max(len(decl) for decl in raw_decls) if raw_decls else 0

        # Align comments
        member_lines = []
        for decl, member in zip(raw_decls, self.members):
            if member.comment:
                padded = f"{decl:<{max_len + 2}}/**< {member.comment} */"
                member_lines.append(padded)
            else:
                member_lines.append(decl)

        return (
            struct_comment
            + "\n"
            + f"""typedef struct
{{
{chr(10).join(member_lines)}
}} {self.name};"""
        )

    def __str__(self) -> str:
        """Generate the complete array definition."""
        count = len(self.entries)
        array_name_upper = self.array_name.upper()
        array_const = (
            f"static const {self.name} {self.array_name}[{array_name_upper}_COUNT]"
        )

        entry_lines = [f"  {entry}" for entry in self.entries]

        array_comment = to_c_comment(f"{self.array_name}:\n\n{self.description}")

        return f"""{array_comment}
#define {self.array_name.upper()}_COUNT {count}
{array_const} =
{{
{chr(10).join(entry_lines)}
}};"""


class TrieChildren(CStructure):
    """The trie_children array for the radix trie search structure.

    This array contains all compressed edges in the trie. Each edge connects a
    parent node to a child node via a substring label. Labels are stored in a
    flat `trie_labels` array and referenced by offset+length for space
    efficiency. Children are sorted lexicographically by label for deterministic
    output.
    """

    name: ClassVar[str] = "TrieChild"
    array_name: ClassVar[str] = "trie_children"
    description: ClassVar[str] = textwrap.dedent("""\
        Represents a compressed edge in the radix trie. Each edge
        connects a parent node to a child node via a substring label.
        Labels are stored in a flat char array (trie_labels) and
        referenced by offset+length for space efficiency.""")
    members: ClassVar[list[CStructureMemberSpec]] = [
        CStructureMemberSpec(
            "gsize",
            "label_offset",
            "Offset into trie_labels array where this edge label starts",
        ),
        CStructureMemberSpec(
            "guint16",
            "label_length",
            "Length of the edge label in bytes",
        ),
        CStructureMemberSpec(
            "gsize",
            "node_id",
            "Index into trie_nodes array for the destination node",
        ),
    ]

    def __init__(self, child_entries: list[TrieChildData]) -> None:
        """Initialise a new set of trie children."""
        self._entries = child_entries

    @property
    def entries(self) -> list[TrieChildData]:
        """The current trie children."""
        return self._entries


class TrieNodes(CStructure):
    """The trie_nodes array for the trie search structure.

    This array contains all nodes in the prefix trie, each representing a
    searchable prefix state with associated matches and child transitions.odes
    in the prefix trie, each representing
    """

    name: ClassVar[str] = "TrieNode"
    array_name: ClassVar[str] = "trie_nodes"
    description: ClassVar[str] = textwrap.dedent("""\
        Represents a node in a prefix trie data structure optimized for
        character/emoji keyword search. The trie allows efficient prefix
        matching - as the user types, we can quickly find all
        characters/emoji that match the current prefix.

        Each node stores:
        - A list of character indices reachable from this prefix with
          their match flags
        - Child nodes for continuing the search with additional characters
        - The structure uses flattened arrays for space efficiency""")
    members: ClassVar[list[CStructureMemberSpec]] = [
        CStructureMemberSpec(
            "gsize",
            "entries_offset",
            "Offset into match_entries array where this node's entries start",
        ),
        CStructureMemberSpec(
            "gsize",
            "children_offset",
            "Offset into trie_children array where this node's children start",
        ),
        CStructureMemberSpec(
            "guint16",
            "entries_count",
            "Number of consecutive match entries belonging to this node",
        ),
        CStructureMemberSpec(
            "guint8",
            "children_count",
            "Number of consecutive child entries belonging to this node",
        ),
    ]

    def __init__(self, node_entries: list[TrieNodeData]) -> None:
        """Iniialise a new collection of trie nodes."""
        self._entries = node_entries

    @property
    def entries(self) -> list[TrieNodeData]:
        """The current entries."""
        return self._entries


class MatchEntries(CStructure):
    """The match_entries array for the trie search structure.

    This array contains all character/emoji matches reachable from each trie
    node, along with metadata about how each match was found (via keyword, name,
    or token). Nodes reference contiguous sections of this array using offset
    and count pairs. This array contains all character/emoji matches reachable
    from each trie node,
    """

    name: ClassVar[str] = "MatchEntry"
    array_name: ClassVar[str] = "match_entries"
    description: ClassVar[str] = textwrap.dedent("""\
        Represents a character/emoji match at a specific trie node, including
        metadata about how the match was found. The flags allow the consumer
        to implement their own scoring policy at runtime.""")
    members: ClassVar[list[CStructureMemberSpec]] = [
        CStructureMemberSpec(
            "gsize",
            "item_index",
            "Index into the main character array",
        ),
        CStructureMemberSpec(
            "TrieMatchFlags",
            "flags",
            "Match flags bitfield (uint8 saves memory)",
        ),
    ]

    def __init__(self) -> None:
        """Initialise a new empty collection of match entries."""
        self._entries: list[MatchEntryData | CommentEntry] = []
        self.prefix_to_offset: dict[str, int] = {}
        self._data_entry_count = 0

    @property
    def entries(self) -> list[MatchEntryData | CommentEntry]:
        """The current match entries."""
        return self._entries

    @property
    def entries_count(self) -> int:
        """The number of non-comment entries, used for offset tracking."""
        return self._data_entry_count

    def add_node_entries(
        self,
        node_prefix: str,
        node_id: int,
        sorted_entries: list[tuple[int, MatchEntry]],
        items: list[Item],
    ) -> None:
        """Add entries for a node, tracking the offset by prefix."""
        if not sorted_entries:
            return

        self.prefix_to_offset[node_prefix] = self._data_entry_count

        # Add comment header for the node
        hdr = (
            f'node {node_id} prefix="{node_prefix}"'
            if node_prefix
            else f"node {node_id} (root)"
        )
        self._entries.append(CommentEntry(hdr))

        # Add the actual match entries
        for item_index, entry in sorted_entries:
            item = items[item_index]
            keywords_str = self._format_keywords_for_comment(
                entry.source_keywords,
                entry.flags,
            )
            prefix_disp = f"{item.preview} " if item.preview else ""
            comment = (
                f"{prefix_disp}`{item.name}`{keywords_str}  "
                f"flags={MatchFlag(entry.flags)!s}"
            )

            self._entries.append(MatchEntryData(item_index, entry.flags, comment))
            self._data_entry_count += 1

    def _format_keywords_for_comment(self, keywords: set[str], flags: Flags) -> str:
        """Format keywords for display in generated C comments."""
        if not keywords:
            return ""

        kw_parts = []
        for kw in sorted(keywords):
            partial_suffix = " (partial)" if flags.partial else ""
            kw_parts.append(f'"{kw}"{partial_suffix}')

        return f" [kw: {', '.join(kw_parts)}]"

    def prefix_offset(self, prefix: str) -> int:
        """Get the array offset for a given node prefix."""
        return self.prefix_to_offset.get(prefix, 0)


@dataclass
class MatchEntryData:
    """A single match entry linking a character to a search prefix."""

    item_index: int
    flags: Flags
    comment: str = ""

    def __str__(self) -> str:
        """Render the match entry with a comment indicating why this matches."""
        comment = f"/* {self.comment} */ " if self.comment else ""
        return f"{comment}{{ {self.item_index}, 0x{self.flags:02X} }},"


def generate_flag_definitions() -> str:
    """Generate the C flag definitions and type aliases."""
    flag_comment = to_c_comment(
        textwrap.dedent("""\
        TrieMatchFlags:

        Bitfield flags indicating how a character/emoji match was found.
        Multiple flags can be combined to show all the ways a match
        occurred."""),
    )

    return f"""{flag_comment}
/**
 * TRIE_MATCH_FROM_KEYWORD:
 *
 * Match originates from a CLDR keyword or alternative phrase. Keywords are
 * human-friendly terms like "happy" for 😊 or "fire" for 🔥.
 */
#define TRIE_MATCH_FROM_KEYWORD (1u << 1)

/**
 * TRIE_MATCH_FROM_NAME:
 *
 * Match originates from the technical Unicode name or display name. Names are
 * official designations like "SMILING FACE WITH SMILING EYES".
 */
#define TRIE_MATCH_FROM_NAME (1u << 2)

/**
 * TRIE_MATCH_FROM_TOKEN:
 *
 * Match originates from a tokenized word within a name or keyword. Tokens are
 * individual words extracted from by splitting both keywords and names on
 * whitespace and punctuation.
 */
#define TRIE_MATCH_FROM_TOKEN (1u << 3)

/**
 * TRIE_MATCH_FULL_NAME:
 *
 * Indicates that a complete emoji/character name ends at this trie node. Only
 * valid when the entire search term has been consumed during traversal. Use
 * %MATCH_IS_FULL_NAME to validate both the flag and search completion.
 */
#define TRIE_MATCH_FULL_NAME (1u << 4)

/**
 * TRIE_MATCH_FULL_KEYWORD:
 *
 * Indicates that a complete CLDR keyword ends at this trie node. Only valid
 * when the entire search term has been consumed during traversal. Use
 * %MATCH_IS_FULL_KEYWORD to validate both the flag and search completion.
 */
#define TRIE_MATCH_FULL_KEYWORD (1u << 5)

/**
 * TRIE_MATCH_FULL_TOKEN:
 *
 * Indicates that a complete tokenized word ends at this trie node. Only valid
 * when the entire search term has been consumed during traversal. Use
 * %MATCH_IS_FULL_TOKEN to validate both the flag and search completion.
 */
#define TRIE_MATCH_FULL_TOKEN (1u << 6)

typedef guint8 TrieMatchFlags;  /**< Flags for determining the kind of match this is */

/**
 * MATCH_IS_COMPLETE:
 * @p: Current position pointer within a normalized search string
 *
 * Determines whether trie traversal has consumed the entire search term.
 * meaning that this was a complete match.
 *
 * Returns: %TRUE if the entire search string has been consumed
 */
#define MATCH_IS_COMPLETE(p) (*(p) == '\\0')

/**
 * MATCH_IS_FULL_NAME:
 * @f: TrieMatchFlags from a MatchEntry
 * @p: Current position in search string
 *
 * Validates complete name match. See %TRIE_MATCH_FULL_NAME.
 *
 * Returns: %TRUE if complete name match
 */
#define MATCH_IS_FULL_NAME(f, p) ((f)&TRIE_MATCH_FULL_NAME && MATCH_IS_COMPLETE (p))

/**
 * MATCH_IS_FULL_KEYWORD:
 * @f: TrieMatchFlags from a MatchEntry
 * @p: Current position in search string
 *
 * Validates complete keyword match. See %TRIE_MATCH_FULL_KEYWORD.
 *
 * Returns: %TRUE if complete keyword match
 */
#define MATCH_IS_FULL_KEYWORD(f, p) ((f)&TRIE_MATCH_FULL_KEYWORD && MATCH_IS_COMPLETE (p))

/**
 * MATCH_IS_FULL_TOKEN:
 * @f: TrieMatchFlags from a MatchEntry
 * @p: Current position in search string
 *
 * Validates complete token match. See %TRIE_MATCH_FULL_TOKEN.
 *
 * Returns: %TRUE if complete token match
 */
#define MATCH_IS_FULL_TOKEN(f, p) ((f)&TRIE_MATCH_FULL_TOKEN && MATCH_IS_COMPLETE (p))

/**
 * MATCH_IS_PREFIX_ONLY:
 * @f: TrieMatchFlags from a MatchEntry
 * @p: Current position in search string
 *
 * Determines if entry is only a prefix match (no complete match).
 *
 * Returns: %TRUE if only a prefix match
 */
#define MATCH_IS_PREFIX_ONLY(f, p) (!((f) & (TRIE_MATCH_FULL_NAME | TRIE_MATCH_FULL_KEYWORD | TRIE_MATCH_FULL_TOKEN)) || !MATCH_IS_COMPLETE (p))

/**
 * MATCH_IS_FROM_NAME:
 * @f: TrieMatchFlags from a MatchEntry
 *
 * Determines if match originated from a technical/display name.
 *
 * Returns: %TRUE if match is from a name
 */
#define MATCH_IS_FROM_NAME(f)     ((f)&TRIE_MATCH_FROM_NAME)

/*
 * MATCH_IS_FROM_KEYWORD:
 *
 * Determines if match originated from a CLDR keyword/phrase.
 *
 * Returns: %TRUE if match is from a keyword
 */
#define MATCH_IS_FROM_KEYWORD(f)  ((f)&TRIE_MATCH_FROM_KEYWORD)

/*
 * MATCH_IS_FROM_TOKEN:
 *
 * Determines if match originated from a tokenised word (part of a name/keyword).
 *
 * Returns: %TRUE if match is from a token
 */
#define MATCH_IS_FROM_TOKEN(f)     ((f)&TRIE_MATCH_FROM_TOKEN)"""  # noqa: E501


class MatchFlag(IntFlag):
    """Bitfield flags indicating how a character/emoji match was found.

    These flags are used during trie construction and in the generated C code
    to indicate the source and type of match for each character/emoji entry.
    """

    NONE = 0
    FROM_KEYWORD = 1 << 1  # From CLDR keyword/phrase
    FROM_NAME = 1 << 2  # From technical/display name
    FROM_TOKEN = 1 << 3  # From tokenised word
    FULL_NAME = 1 << 4  # Full name/tts phrase ends here
    FULL_KEYWORD = 1 << 5  # Full keyword phrase ends here
    FULL_TOKEN = 1 << 6  # Full token ends here (word boundary)

    def __str__(self) -> str:
        """Return the flag name for debugging."""
        return f"{self.name}"

    @property
    def partial(self) -> bool:
        """Decide if this is a partial match.

        If none of the `FULL` bits are set.
        """
        full_mask = MatchFlag.FULL_NAME | MatchFlag.FULL_KEYWORD | MatchFlag.FULL_TOKEN
        return (self & full_mask) == 0


type ItemIndex = int
type Flags = MatchFlag
type Term = str
type Utf8 = str


def normalise_term(s: str) -> str:
    """Normalise a term for trie insertion and lookup.

    Since input data is already normalized during loading (Unicode normalization
    and whitespace collapsing), this function only performs case-folding using
    GLib's g_utf8_casefold for compatibility with the C implementation.

    Args:
        s: The input string to normalise (already Unicode-normalized).

    Returns:
        A case-folded string using GLib's case folding algorithm.

    Example:
        >>> normalise_term("Happy Face")
        "happy face"

    """
    # Use GLib's case folding for compatibility with the C side
    return GLib.utf8_casefold(s, -1)


# Tokeniser: capture compound words and their parts (hyphen/apostrophe).
# Example:
#   "ice-cream" → "ice-cream", "ice", "cream"
_TOKENISE_RE = re.compile(
    r"""
    (?=                      # Lookahead for the full compound
      (                      # Group 1: full compound word
        \b\w+(?:[-']\w+)*\b
      )
    )
    \b(\w+)\b                # Group 2: actual match is the current part
    """,
    re.VERBOSE,
)


def tokenise(phrase: str) -> list[str]:
    """Split a phrase into tokens (compounds and their parts).

    Args:
        phrase: The phrase to tokenise.

    Returns:
        A list of unique tokens extracted from the phrase, including
        compound words and their constituent parts.

    Example:
        >>> tokenise("ice-cream cone")
        ["ice-cream", "ice", "cream", "cone"]

    """
    s = normalise_term(phrase)
    if not s:
        return []

    tokens: set[str] = set()
    for match in _TOKENISE_RE.finditer(s):
        compound = match.group(1)
        part = match.group(2)

        tokens.add(compound)

        if part:
            tokens.add(part)

    return list(tokens)


@dataclass
class MatchEntry:
    """Represents one item's match data at a specific trie node.

    This tracks not only the flags but also which keywords caused
    this item to be associated with this prefix, enabling better
    debugging and understanding of the trie structure.
    """

    item_index: ItemIndex
    flags: Flags = MatchFlag.NONE
    source_keywords: set[str] = field(default_factory=set)

    def add(self, flags: Flags, keyword: str = "") -> None:
        """Add flags and optionally track the source keyword.

        Args:
            flags: Additional flags to OR with existing flags.
            keyword: The keyword that caused this entry (for debugging).

        """
        self.flags |= flags
        if keyword:
            self.source_keywords.add(keyword)


@dataclass(eq=False)
class TrieNode:
    """Trie node representing a searchable prefix state.

    Each node represents a prefix in the search tree and contains:
    - Children nodes for extending the search
    - Match entries for items reachable from this prefix
    - Metadata for debugging and serialization
    """

    children: dict[str, TrieNode] = field(default_factory=dict)
    entries: dict[ItemIndex, MatchEntry] = field(default_factory=dict)

    # Bookkeeping fields, updated as we go
    node_id: int = -1
    path_segments: list[str] = field(default_factory=list)
    ending_keywords: set[str] = field(default_factory=set)

    def __iter__(self):
        """Iterate over (label, child) pairs in UTF-8 byte order."""
        return iter(
            sorted(
                self.children.items(),
                key=lambda kv: kv[0].encode("utf-8"),
            )
        )

    @property
    def prefix(self) -> str:
        """Path from the root to this node"""

        return "".join(self.path_segments)


@dataclass
class Item:
    """Unified item covering emoji and non-emoji CLDR characters."""

    utf8: Utf8
    codepoints: CodepointSequence
    name: str

    @property
    def preview(self) -> str:
        """Get printable preview or empty string."""
        return self.utf8 if self.utf8.isprintable() else ""


@dataclass
class CldrAnnotations:
    """Typed CLDR payload."""

    default: list[str]
    tts: list[str]


@dataclass
class TrieChildData:
    """Represents a single child transition in the radix trie.

    Each edge is labelled with a substring. For space efficiency, all labels are
    concatenated into a flat `trie_labels` array, and each child stores an
    offset+length into that array.
    """

    label_offset: int  # Offset into trie_labels array
    label_length: int  # Length of the substring in bytes
    node_id: int  # Index into trie_nodes array for the destination node
    path_segments: list[str]  # The path from the root to this node

    def __str__(self) -> str:
        """Format as C initialiser with comment."""

        safe_segments = [
            '"'
            + "".join(
                ch
                if ch.isprintable() and ch not in {'"', "\\"}
                else f"\\u{ord(ch):04X}"
                for ch in segment
            )
            + '"'
            for segment in self.path_segments
        ]

        safe_label = " → ".join(safe_segments)

        return (
            f"/* {safe_label} */ "
            f"{{ {self.label_offset}, {self.label_length}, {self.node_id} }},"
        )


@dataclass
class TrieNodeData:
    """Represents a single trie node in the search tree."""

    entries_offset: int
    children_offset: int
    entries_count: int
    children_count: int

    comment: str

    def __str__(self) -> str:
        """Format as C initialiser with comment."""
        entries_offset = self.entries_offset
        children_offset = self.children_offset
        entries_count = self.entries_count
        children_count = self.children_count
        return (
            f"/* {self.comment} */ {{ {entries_offset}, {children_offset}, "
            f"{entries_count}, {children_count} }},"
        )


class Trie:
    """Prefix trie with deterministic serialisation to flattened C arrays.

    This class builds a prefix trie from character/emoji keywords and generates
    optimised C data structures for efficient runtime search. The trie enables
    O(k) prefix matching where k is the length of the search term.
    """

    def __init__(self) -> None:
        """Initialise a new empty Trie."""
        self.root = TrieNode()
        self.root.node_id = 0
        self._ordered_nodes: list[TrieNode] | None = None

    @property
    def ordered_nodes(self) -> list[TrieNode]:
        """Access to ordered nodes with lazy initialization."""
        if self._ordered_nodes is None:
            self._ordered_nodes = []

        return self._ordered_nodes

    def _add_entry(
        self,
        node: TrieNode,
        item_index: ItemIndex,
        flags: Flags,
        keyword: str = "",
    ) -> None:
        """Connect a character/emoji to a search prefix, building the search index.

        This is the core method that builds search relationships - when a user types
        a prefix, they'll find all items connected here. Flags indicate match quality
        for ranking, and keywords enable debugging the search logic.

        Args:
            node: The trie node to add the entry to.
            item_index: Index of the item in the main items array.
            flags: Match flags indicating how this item was found.
            keyword: The keyword that led to this entry (for debugging).

        """
        entry = node.entries.get(item_index)
        if entry is None:
            entry = MatchEntry(item_index=item_index, flags=MatchFlag.NONE)
            node.entries[item_index] = entry

        entry.add(flags, keyword)

    def _insert_string(
        self,
        s: str,
        item_index: ItemIndex,
        *,
        base_flags: Flags,
        final_flags: Flags,
    ) -> None:
        """Insert a string into the radix trie with edge splitting.

        Args:
            s: The string to insert (already normalised).
            item_index: Index of the item in the items array.
            base_flags: Flags that apply to all prefixes of this string.
            final_flags: Extra flags to OR at the final node (e.g. FULL_TOKEN).
        """

        def longest_common_prefix(a: str, b: str) -> int:
            """Return length of longest common prefix of a and b."""
            i = 0

            while i < len(a) and i < len(b) and a[i] == b[i]:
                i += 1

            if debug and i > 0:
                print(f"    LCP('{a}', '{b}') = {i}", file=sys.stderr)

            return i

        if not s:
            return

        # Debug: track pizza and joy insertion
        debug = s == "joy" and item_index == 1700  # Only first joy insertion
        if debug:
            print(
                f"DEBUG: _insert_string() called with '{s}', item_index={item_index}",
                file=sys.stderr,
            )

        node = self.root
        rem = s

        while rem:
            if debug:
                print(
                    f"  At node with {len(node.children)} children, rem='{rem}'",
                    file=sys.stderr,
                )
                for lbl in sorted(node.children.keys()):
                    print(f"    Child: '{lbl}'", file=sys.stderr)

            for label, child in list(node):
                lcp = longest_common_prefix(rem, label)
                if lcp == 0:
                    continue

                if lcp == len(label):
                    # Edge fully matches, descend
                    if debug:
                        print(
                            f"  Full match with edge '{label}', descending",
                            file=sys.stderr,
                        )
                    node = child
                    rem = rem[lcp:]
                    break

                # Split edge into common prefix, remainder of new string, and remainder of old label
                common, rem_rest, label_rest = rem[:lcp], rem[lcp:], label[lcp:]
                if debug:
                    print(f"  Splitting edge '{label}' at '{common}'", file=sys.stderr)

                # Create intermediate node for the common prefix
                new_node = TrieNode()
                node.children.pop(label)
                node.children[common] = new_node

                if label_rest:
                    # Reattach the old child under the remainder of the old label
                    new_node.children[label_rest] = child
                else:
                    # No leftover: the old child becomes the intermediate node
                    # Move its entries/children into new_node
                    new_node.entries.update(child.entries)
                    new_node.children.update(child.children)

                if rem_rest:
                    # Create a new child for the remainder of the new string
                    new_child = TrieNode()
                    new_node.children[rem_rest] = new_child
                    node = new_child
                    rem = ""
                else:
                    # The new string ends exactly at the split
                    node = new_node
                    rem = ""

                break
            else:
                # No overlap, add new edge
                if debug:
                    print(
                        f"  No matching child, adding new edge '{rem}'", file=sys.stderr
                    )
                new_child = TrieNode()
                node.children[rem] = new_child
                node = new_child
                rem = ""

        # Mark final node
        flags = base_flags | final_flags
        node.ending_keywords.add(s)
        self._add_entry(node, item_index, flags, s)

    def insert_phrase(
        self,
        phrase: str,
        item_index: ItemIndex,
        *,
        flags: Flags,
    ) -> None:
        """Insert a full phrase and its tokens into the trie.

        Args:
            phrase: The keyword phrase to insert.
            item_index: Index of the character/emoji in the items array.
            flags: Base flags indicating the source (CLDR, name, etc).

        Note:
            The phrase is normalised before insertion. It is also tokenised
            and each token is inserted separately for partial matching.

        """
        phrase_norm = normalise_term(phrase)
        if not phrase_norm:
            return

        terminal_flag = MatchFlag.NONE
        if flags & MatchFlag.FROM_NAME:
            terminal_flag = MatchFlag.FULL_NAME
        elif flags & MatchFlag.FROM_KEYWORD:
            terminal_flag = MatchFlag.FULL_KEYWORD

        self._insert_string(
            phrase_norm,
            item_index,
            base_flags=flags,
            final_flags=terminal_flag,
        )

        for token in tokenise(phrase_norm):
            self.insert_token(token, item_index, flags=flags)

    def insert_token(
        self,
        token: str,
        item_index: ItemIndex,
        *,
        flags: Flags,
    ) -> None:
        """Create partial match paths for individual words within phrases.

        Enables users to find characters by typing just part of a keyword.
        For example, typing "ice" will find items with "ice-cream" in their keywords.

        Args:
            token: The individual token to insert.
            item_index: Index of the character/emoji in the items array.
            flags: Base flags indicating the original source.

        """
        token_norm = normalise_term(token)
        if not token_norm:
            return

        self._insert_string(
            token_norm,
            item_index,
            base_flags=flags | MatchFlag.FROM_TOKEN,
            final_flags=MatchFlag.FULL_TOKEN,
        )

    def _index_nodes(self) -> None:
        """Assign contiguous indices to nodes using DFS pre-order over sorted edges.

        This creates a deterministic ordering of nodes for C array generation.
        The DFS traversal ensures parent nodes always have lower indices than
        their children, and sorting edges alphabetically makes the output
        reproducible across runs.
        """
        self.ordered_nodes.clear()

        def dfs(node: TrieNode, segments: list[str]) -> None:
            node.node_id = len(self.ordered_nodes)
            node.path_segments = segments
            self.ordered_nodes.append(node)

            for label, child in node:
                dfs(child, segments + [label])

        dfs(self.root, [])

    def _format_keywords_for_comment(self, keywords: set[str], flags: Flags) -> str:
        """Format keywords for display in generated C comments."""
        if not keywords:
            return ""

        kw_parts = []
        for kw in sorted(keywords):
            partial_suffix = " (partial)" if flags.partial else ""
            kw_parts.append(f'"{kw}"{partial_suffix}')

        return f" [kw: {', '.join(kw_parts)}]"

    def _emit_children(self) -> tuple[list[TrieChildData], dict[int, int], bytes]:
        """Build trie_children, node->children_offset map and node->label list."""
        all_children: list[TrieChildData] = []
        children_offset_map: dict[int, int] = {}
        label_bytes = bytearray()
        offset = 0

        for node in self.ordered_nodes:
            if not node.children:
                continue

            children_offset_map[node.node_id] = len(all_children)

            for label, child in node:
                label_encoded = label.encode("utf-8")
                label_offset = offset
                label_length = len(label_encoded)
                label_bytes.extend(label_encoded)
                offset += label_length

                all_children.append(
                    TrieChildData(
                        label_offset=label_offset,
                        label_length=label_length,
                        node_id=child.node_id,
                        path_segments=node.path_segments + [label],
                    )
                )

        return all_children, children_offset_map, label_bytes

    def _emit_nodes(
        self,
        match_entries: MatchEntries,
        children_offset_map: dict[int, int],
    ) -> list[TrieNodeData]:
        """Build trie_nodes payload with comments."""
        entries: list[TrieNodeData] = []

        for node in self.ordered_nodes:
            entries_offset = match_entries.prefix_offset(node.prefix)
            entries_count = len(node.entries)
            children_offset = children_offset_map.get(node.node_id, 0)
            children_count = len(node.children)

            comment_parts: list[str] = []
            prefix_desc = "root" if not node.prefix else f'prefix: "{node.prefix}"'
            comment_parts.append(prefix_desc)

            if node.ending_keywords:
                words = sorted(node.ending_keywords)
                words_str = ", ".join(words)
                comment_parts.append(f"words: {words_str}")

            if entries_count > 0:
                comment_parts.append(f"{entries_count} items")

            comment = " → ".join(comment_parts)

            entries.append(
                TrieNodeData(
                    entries_offset=entries_offset,
                    entries_count=entries_count,
                    children_offset=children_offset,
                    children_count=children_count,
                    comment=comment,
                ),
            )

        return entries

    def _emit_labels_array(self, label_bytes: bytes) -> str:
        escaped_str = (
            label_bytes.decode("utf-8").replace("\\", "\\\\").replace('"', '\\"')
        )

        out = []
        for i in range(0, len(escaped_str), 76):
            chunk = escaped_str[i : i + 76]
            out.append('"' + chunk + '"')
        return "static const char trie_labels[] =\n  " + "\n  ".join(out) + ";"

    def generate_header(self, items: list[Item]) -> str:
        """Generate complete C header file with trie data structures.

        This method composes all components of the trie into a C header:
        - File header with statistics
        - Flag definitions and type aliases
        - Struct type definitions for all data types
        - The data arrays themselves

        Args:
            items: List of all characters/emoji in the trie.

        Returns:
            Complete C header content as string

        """
        self._index_nodes()

        match_entries = MatchEntries()
        for node in self.ordered_nodes:
            if not node.entries:
                continue

            sorted_entries = sorted(node.entries.items())
            match_entries.add_node_entries(
                node.prefix,
                node.node_id,
                sorted_entries,
                items,
            )

        child_entries, children_offset_map, labels_array = self._emit_children()
        node_entries = self._emit_nodes(match_entries, children_offset_map)

        child_structure = TrieChildren(child_entries)
        node_structure = TrieNodes(node_entries)

        sections = [
            self._generate_file_header(items),
            generate_flag_definitions(),
            match_entries.type_definition(),
            child_structure.type_definition(),
            node_structure.type_definition(),
            str(match_entries),
            str(child_structure),
            str(node_structure),
            self._emit_labels_array(labels_array),
        ]

        return "\n\n".join(sections) + "\n"

    def _generate_file_header(self, items: list[Item]) -> str:
        """Generate C header boilerplate with statistics.

        Args:
            items: List of items for generating statistics.

        Returns:
            File header with includes and statistics

        """
        unique_entries = len(
            {e.item_index for n in self.ordered_nodes for e in n.entries.values()},
        )

        header_comment = to_c_comment(f"""\
            Generated prefix trie for character/emoji keyword search

            This file is auto-generated. Do not edit.

            Statistics:
            - Total items: {len(items)}
            - Total nodes: {len(self.ordered_nodes)}
            - Trie depth: {max(len(n.prefix) for n in self.ordered_nodes)}
            - Unique searchable items: {unique_entries}
            """)

        return f"""{header_comment}

#pragma once

#include <glib.h>"""


def _dedupe_strings(xs: Iterable[str]) -> list[str]:
    """Remove duplicates while preserving order.

    Args:
        xs: Iterable of strings to deduplicate

    Returns:
        List with duplicates removed, order preserved

    """
    out: list[str] = []
    seen: set[str] = set()
    for s in xs:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _extract_annotation_lists(payload: dict) -> tuple[list[str], list[str]]:
    """Extract default and tts lists from annotation payload.

    Args:
        payload: Dictionary containing annotation data

    Returns:
        Tuple of (defaults list, tts list)

    """
    defaults_obj = payload.get("default") or payload.get("keywords") or []
    tts_obj = payload.get("tts") or []
    defaults = [str(x) for x in defaults_obj] if isinstance(defaults_obj, list) else []
    tts = [str(x) for x in tts_obj] if isinstance(tts_obj, list) else []
    return defaults, tts


def _validate_annotations_structure(data: Mapping[str, object], path: Path) -> dict:
    """Validate and extract the nested annotations structure.

    Args:
        data: Raw JSON data from annotations file
        path: Path to file for error reporting

    Returns:
        The annotations dictionary

    Raises:
        SystemExit: If structure validation fails

    """
    if not isinstance(data, dict) or "annotations" not in data:
        print(f"Error: {path} missing 'annotations' key", file=sys.stderr)
        sys.exit(1)

    outer = data["annotations"]
    if not isinstance(outer, dict) or "annotations" not in outer:
        print(
            f"Error: {path} missing nested 'annotations.annotations' key",
            file=sys.stderr,
        )
        sys.exit(1)

    ann_raw = outer["annotations"]
    if not isinstance(ann_raw, dict):
        print(f"Error: {path} annotations.annotations is not a dict", file=sys.stderr)
        sys.exit(1)

    return ann_raw


def load_annotations(path: Path) -> dict[Utf8, CldrAnnotations]:
    """Extract searchable keywords from Unicode CLDR annotation data.

    CLDR provides the standardised keywords that users expect to find characters
    by, such as "happy" for 😊 or "thumbs up" for 👍. This loads and parses that
    data.

    Args:
        path: Path to the annotations.json file.

    Returns:
        Dictionary mapping UTF-8 characters to their CLDR annotations.

    """
    merged: dict[Utf8, CldrAnnotations] = {}

    def add_payload(key: Utf8, defaults: Iterable[str], tts: Iterable[str]) -> None:
        d = _dedupe_strings(defaults)
        t = _dedupe_strings(tts)
        if key not in merged:
            merged[key] = CldrAnnotations(default=d, tts=t)
            return

        cur = merged[key]
        cur_default_set = set(cur.default)
        cur_tts_set = set(cur.tts)
        merged[key] = CldrAnnotations(
            default=cur.default + [s for s in d if s not in cur_default_set],
            tts=cur.tts + [s for s in t if s not in cur_tts_set],
        )

    try:
        text = path.read_text(encoding="utf-8")
        data: Mapping[str, object] = json.loads(text, cls=NormalizingJSONDecoder)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"Error: failed to read {path}: {e}", file=sys.stderr)
        sys.exit(1)

    ann_raw = _validate_annotations_structure(data, path)

    for key_utf8, payload in ann_raw.items():
        if not isinstance(payload, dict):
            continue
        defaults, tts = _extract_annotation_lists(payload)
        add_payload(key_utf8, defaults, tts)

    return merged


def _build_emoji_index(
    emojis: list[Emoji],
) -> tuple[list[Item], dict[Utf8, ItemIndex]]:
    """Build the initial index of emoji items.

    Args:
        emojis: List of emoji from emoji-test.txt

    Returns:
        Tuple of (items list, UTF-8 to index mapping)

    """
    items: list[Item] = []
    index_by_utf8: dict[Utf8, ItemIndex] = {}

    for e in emojis:
        idx = len(items)
        items.append(Item(utf8=e.utf8, codepoints=e.codepoints, name=e.name))
        index_by_utf8[e.utf8] = idx
        alias = e.utf8.replace("\ufe0f", "")
        index_by_utf8.setdefault(alias, idx)

    return items, index_by_utf8


def _get_tts_name(key_utf8: str, cps: list[int], payload: CldrAnnotations) -> str:
    """Get the TTS name for a character with fallbacks.

    Args:
        key_utf8: The UTF-8 character
        cps: List of codepoints
        payload: CLDR annotations

    Returns:
        Best available name for the character

    """
    tts_name = payload.tts[0] if payload.tts else ""

    if not tts_name:
        if len(cps) == 1:
            try:
                tts_name = unicodedata.name(key_utf8)
            except ValueError:
                tts_name = f"U+{cps[0]:04X}"

        if len(cps) > 1:
            # Conservative fallback for sequences
            tts_name = " ".join(f"U+{cp:04X}" for cp in cps)

    return tts_name


def _process_cldr_entry(
    key_utf8: str,
    payload: CldrAnnotations,
    items: list[Item],
    index_by_utf8: dict[Utf8, ItemIndex],
    trie: Trie,
) -> None:
    """Process a single CLDR entry and add it to the trie.

    Args:
        key_utf8: The UTF-8 character key
        payload: CLDR annotations for this character
        items: List of items to append to
        index_by_utf8: Mapping to update
        trie: Trie to insert into

    """
    idx = index_by_utf8.get(key_utf8)
    idx = idx or index_by_utf8.get(key_utf8.replace("\ufe0f", ""))

    if idx is None:
        # New non-emoji item
        cps = [ord(ch) for ch in key_utf8]
        tts_name = _get_tts_name(key_utf8, cps, payload)

        idx = len(items)
        items.append(Item(utf8=key_utf8, codepoints=cps, name=tts_name))
        index_by_utf8[key_utf8] = idx

    # Insert CLDR tts as a name-like phrase (FROM_NAME)
    for tts in payload.tts:
        if not tts:
            continue

        trie.insert_phrase(
            phrase=tts,
            item_index=idx,
            flags=MatchFlag.FROM_NAME,
        )

    for kw in payload.default:
        if not kw:
            continue

        trie.insert_phrase(
            phrase=kw,
            item_index=idx,
            flags=MatchFlag.FROM_KEYWORD,
        )


def build_trie(emoji_file: Path, annotation_file: Path) -> tuple[Trie, list[Item]]:
    """Construct the complete searchable index from Unicode and CLDR data.

    Combines emoji definitions with their human-readable keywords to create
    a fast search structure. This is the main pipeline that processes raw
    Unicode data into the optimised search index.

    Args:
        emoji_file: Path to emoji-test.txt file.
        annotation_file: Path to CLDR annotations.json file.

    Returns:
        A tuple of (trie, items) where trie is the built search structure
        and items is the list of all characters/emoji.

    """
    # Parse emoji from emoji-test
    parser = EmojiDataParser(str(emoji_file))
    emojis: list[Emoji] = parser.by_codepoint()

    # Build initial emoji index
    items, index_by_utf8 = _build_emoji_index(emojis)

    # Load CLDR annotations
    cldr_map: dict[Utf8, CldrAnnotations] = load_annotations(annotation_file)

    # Build the trie
    trie = Trie()

    # Insert technical emoji names (FROM_NAME)
    for idx, item in enumerate(items):
        trie.insert_phrase(
            phrase=item.name,
            item_index=idx,
            flags=MatchFlag.FROM_NAME,
        )

    # Add all CLDR keys (emoji and non-emoji)
    for key_utf8, payload in cldr_map.items():
        _process_cldr_entry(key_utf8, payload, items, index_by_utf8, trie)

    return trie, items


def main() -> None:
    """Command-line tool to generate optimised search indexes for GNOME Characters.

    This is the build-time tool that processes Unicode emoji data and CLDR keywords
    into efficient C data structures for runtime character search. The output header
    file is compiled into the GNOME Characters application.
    """
    parser = argparse.ArgumentParser(
        description=(
            "Generate character/emoji search trie from Unicode and CLDR data files"
        ),
    )
    parser.add_argument("emoji_test", help="Path to emoji-test.txt file")
    parser.add_argument("annotations", help="Path to CLDR annotations.json file")

    args = parser.parse_args()
    emoji_test_file = Path(args.emoji_test)
    annotation_file = Path(args.annotations)

    trie, items = build_trie(emoji_test_file, annotation_file)

    print(f"Loaded {len(items)} characters/emoji", file=sys.stderr)

    print(trie.generate_header(items))

    print(f"Generated trie with {len(trie.ordered_nodes)} nodes", file=sys.stderr)


if __name__ == "__main__":
    main()
