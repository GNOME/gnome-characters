#include <config.h>

#include "gc.h"

#include <glib/gi18n.h>
#include <langinfo.h>
#include <locale.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "blocks.h"
#include "confusables.h"
#include "emoji.h"
#include "hangul.h"
#include "languages.h"
#include "names.h"
#include "scripts.h"

#define LATIN_BLOCK_SIZE 4
static gsize latin_blocks_initialized;
static struct Block latin_blocks[LATIN_BLOCK_SIZE];
static const gunichar latin_block_starters[LATIN_BLOCK_SIZE] =
  { 0x0000, 0x0080, 0x0100, 0x0180 };
static size_t latin_block_count;

#define HIRAGANA_BLOCK_SIZE 1
static gsize hiragana_blocks_initialized;
static struct Block hiragana_blocks[HIRAGANA_BLOCK_SIZE];
static const gunichar hiragana_block_starters[HIRAGANA_BLOCK_SIZE] =
  { 0x3040 };
static size_t hiragana_block_count;

#define KATAKANA_BLOCK_SIZE 2
static gsize katakana_blocks_initialized;
static struct Block katakana_blocks[KATAKANA_BLOCK_SIZE];
static const gunichar katakana_block_starters[KATAKANA_BLOCK_SIZE] =
  { 0x30A0, 0x31F0 };
static size_t katakana_block_count;

/* Bullets are not specially categorized in the Unicode standard.
   Use the character list from UTR#25 "Unicode Support for Mathematics".  */
static const gunichar bullet_characters[] =
  {
    /* triangle left */
    0x25C2, 0x25C3,
    0x25C0, 0x25C1,
    /* triangle right */
    0x25B8, 0x2023, 0x25B9,
    0x25B6, 0x25B7,
    /* triangle up */
    0x25B4, 0x25B5,
    0x25B2, 0x25B3,
    /* triangle down */
    0x25BE, 0x25BF,
    0x25BC, 0x25BD,
    /* square */
    0x2B1D, 0x2B1E, 0x25AA, 0x25AB, 0x25FD, 0x25FE, 0x25FC, 0x25FB,
    0x25A0, 0x25A1, 0x2B1B, 0x2B1C,
    /* diamond */
    0x2B29, 0x22C4, 0x2B25, 0x2B26, 0x25C6, 0x25C7,
    /* lozenge */
    0x2B2A, 0x2B2B, 0x2B27, 0x2B28, 0x29EB, 0x25CA,
    /* pentagon */
    0x2B1F, 0x2B20,
    /* pentagon right */
    0x2B53, 0x2B54,
    /* hexagon horizontal */
    0x2B23, 0x2394,
    /* hexagon vertical */
    0x2B22, 0x2B21,
    /* arabic star */
    0x2B51, 0x2B52, 0x22C6, 0x2B50, 0x2605, 0x2606,
    /* ellipse horizontal */
    0x2B2C, 0x2B2D,
    /* ellipse vertical */
    0x2B2E, 0x2B2F,
    /* circle */
    0x22C5, 0x2219, 0x00B7, 0x2218, 0x2022, 0x25E6, 0x2981, 0x26AC,
    0x26AB, 0x26AA, 0x25CF, 0x25CB, 0x2B24, 0x25EF,
    /* circled circles */
    0x2299, 0x2609, 0x233E, 0x2A00, 0x29BF, 0x229A, 0x29BE, 0x25C9, 0x25CE
  };
static size_t bullet_character_count = G_N_ELEMENTS (bullet_characters);

#define UNINAME_MAX 256

struct CharacterSequence
{
  gunichar uc[EMOJI_SEQUENCE_LENGTH];
  int length;
};

static int
block_compare (gconstpointer a, gconstpointer b)
{
  const gunichar *key = a;
  const struct Block *element = b;

  return (*key > element->end) - (*key < element->start);
}

static const struct Block *
find_block (gunichar uc)
{
  return bsearch (&uc, all_blocks,
                  G_N_ELEMENTS (all_blocks),
                  sizeof (*all_blocks),
                  block_compare);
}

static int
hangul_compare (gconstpointer a, gconstpointer b)
{
  const gunichar *key = a;
  const struct HangulCharacter *hangul = b;

  return (*key > hangul->uc) - (*key < hangul->uc);
}

static int
character_name_compare (gconstpointer a, gconstpointer b)
{
  const gunichar *key = a;
  const struct CharacterName *element = b;

  return (*key > element->uc) - (*key < element->uc);
}

static int
emoji_compare (gconstpointer a, gconstpointer b)
{
  const struct CharacterSequence *key = a;
  const struct EmojiCharacter *element = b;
  int i;

  for (i = 0; i < MAX (key->length, element->length); i++)
    {
      gunichar auc = i < key->length ? key->uc[i] : 0;
      gunichar buc = i < element->length ? element->uc[i] : 0;

      if (auc < buc)
        return -1;

      if (auc > buc)
        return 1;
    }

  return 0;
}

static char *
get_character_name (const gunichar *uc,
                    int             length,
                    gchar          *buffer)
{
  struct CharacterName *res;
  const struct Block *block;
  static struct Block *cjk_blocks[11];
  static struct Block *tangut_blocks[2];
  static struct Block *hangul_block;
  static gsize local_blocks_initialized = 0;
  gsize i;
  struct EmojiCharacter *emoji_res;
  struct CharacterSequence emoji_key;

  if (length == 1) {
    if (g_once_init_enter (&local_blocks_initialized))
      {
        static const gunichar cjk_block_starters[11] =
          {
            0x4E00,  /* CJK Unified Ideographs */
            0x3400,  /* CJK Unified Ideographs Extension A */
            0x20000, /* CJK Unified Ideographs Extension B */
            0x2A700, /* CJK Unified Ideographs Extension C */
            0x2B740, /* CJK Unified Ideographs Extension D */
            0x2B820, /* CJK Unified Ideographs Extension E */
            0x2CEB0, /* CJK Unified Ideographs Extension F */
            0x2EBF0, /* CJK Unified Ideographs Extension I */
            0x30000, /* CJK Unified Ideographs Extension G */
            0x31350, /* CJK Unified Ideographs Extension H */
            0x323B0, /* CJK Unified Ideographs Extension J */
          };

        static const gunichar tangut_block_starters[2] =
          {
            0x17000, /* Tangut */
            0x18D00, /* Tangut Supplement */
          };

        for (i = 0; i < G_N_ELEMENTS (cjk_block_starters); i++)
          cjk_blocks[i] = (struct Block *)find_block (cjk_block_starters[i]);

        for (i = 0; i < G_N_ELEMENTS (tangut_block_starters); i++)
          tangut_blocks[i] = (struct Block *)find_block (tangut_block_starters[i]);

        hangul_block = (struct Block *)find_block (0xAC00);

        g_once_init_leave (&local_blocks_initialized, 1);
      }

    block = find_block (uc[0]);
    for (i = 0; i < G_N_ELEMENTS (cjk_blocks); i++)
      if (block == cjk_blocks[i])
        {
          snprintf (buffer, UNINAME_MAX, "CJK UNIFIED IDEOGRAPH-%X", uc[0]);
          buffer[UNINAME_MAX] = 0;
          return buffer;
        }

    for (i = 0; i < G_N_ELEMENTS (tangut_blocks); i++)
      if (block == tangut_blocks[i])
        {
          snprintf (buffer, UNINAME_MAX, "TANGUT IDEOGRAPH-%X", uc[0]);
          buffer[UNINAME_MAX] = 0;
          return buffer;
        }

    if (block == hangul_block)
      {
        gunichar decomposition[3] = { 0, 0, 0 };
        size_t decomposition_length = 3;
        size_t pos;

        memcpy (buffer, "HANGUL SYLLABLE ", 16);
        pos = 16;

        if (g_unichar_fully_decompose (uc[0], FALSE, decomposition,
                                       decomposition_length))
          for (i = 0; i < decomposition_length; i++)
            {
              const struct HangulCharacter *hangul_jamo;
              size_t len;

              if (!decomposition[i])
                break;

              hangul_jamo = bsearch (&decomposition[i], hangul_chars,
                                     G_N_ELEMENTS (hangul_chars),
                                     sizeof (*hangul_chars),
                                     hangul_compare);

              len = strlen (hangul_jamo->short_name);
              memcpy (buffer + pos, hangul_jamo->short_name, len);
              pos += len;
            }
        else
          {
            memcpy (buffer + pos, "UNKNOWN", 7);
            pos += 7;
          }

        buffer[pos] = '\0';
        return buffer;
      }
  }

  memcpy (emoji_key.uc, uc, length * sizeof (gunichar));
  emoji_key.length = length;

  emoji_res = bsearch (&emoji_key, emoji_characters,
                       G_N_ELEMENTS (emoji_characters),
                       sizeof (*emoji_characters),
                       emoji_compare);

  if (emoji_res)
    {
      size_t len = strnlen (emoji_res->name, UNINAME_MAX);
      memcpy (buffer, emoji_res->name, len);
      buffer[len] = 0;
      return buffer;
    }

  res = bsearch (uc, character_names,
                 G_N_ELEMENTS (character_names),
                 sizeof (*character_names),
                 character_name_compare);
  if (res)
    {
      size_t len = strnlen (res->name, UNINAME_MAX);
      memcpy (buffer, res->name, len);
      buffer[len] = 0;
      return buffer;
    }

  return NULL;
}

typedef struct GcCharacterIter GcCharacterIter;

struct GcCharacterIter
{
  gunichar uc[EMOJI_SEQUENCE_LENGTH];
  gssize uc_length;

  struct CharacterSequence *characters;
  gssize character_index;
  gssize character_count;

  const size_t *emoji_indices;
  gssize emoji_index;
  gssize emoji_count;
  gboolean only_composite;

  const struct Block *blocks;
  size_t block_index;
  size_t block_count;

  const GUnicodeScript *scripts;
  size_t n_scripts;

  GUnicodeType type;
  const gchar * const * keywords;
  const gsize *keywords_lengths;
  GcSearchFlag flags;

  gboolean (* filter) (GcCharacterIter *iter, const gunichar *uc, int length);
};

static gboolean gc_character_iter_next (GcCharacterIter      *iter);
static gunichar *gc_character_iter_get (GcCharacterIter      *iter,
                                        gssize               *length);

static void     gc_character_iter_init_for_category
                                       (GcCharacterIter      *iter,
                                        GcCategory            category);

static void     gc_character_iter_init_for_keywords
                                       (GcCharacterIter      *iter,
                                        const gchar * const  *keywords,
                                        const gsize          *keywords_lengths);

static int
emoji_indices_compare (gconstpointer a, gconstpointer b)
{
  const gunichar *key = a;
  const size_t *index = b;
  const struct EmojiCharacter *emoji = &emoji_characters[*index];

  return (*key > emoji->uc[0]) - (*key < emoji->uc[0]);
}

static gboolean
is_character_emoji (gunichar uc)
{
  struct EmojiCharacter *res;

  res = bsearch (&uc, emoji_singular_characters,
                 G_N_ELEMENTS (emoji_singular_characters),
                 sizeof (*emoji_singular_characters),
                 emoji_indices_compare);

  return !!res;
}

static gboolean
gc_character_iter_next (GcCharacterIter *iter)
{
  gunichar uc = iter->uc[0];

  /* First, search in the explicit character list.  */
  if (iter->character_index < iter->character_count)
    {
      iter->uc_length = iter->characters[iter->character_index].length;
      memcpy (iter->uc, iter->characters[iter->character_index].uc,
              iter->uc_length * sizeof (gunichar));
      iter->character_index++;
      return TRUE;
    }

  /* Then go through the Unicode blocks.  */
  if (iter->block_index < iter->block_count)
    {
      while (TRUE)
        {
          if (uc != -1 && uc > iter->blocks[iter->block_index].end)
            {
              iter->block_index++;
              uc = -1;
            }

          if (uc == -1)
            {
              if (iter->block_index == iter->block_count)
                break;
              uc = iter->blocks[iter->block_index].start;
            }
          else
            uc++;

          while (uc <= iter->blocks[iter->block_index].end
                 && (!iter->filter (iter, &uc, 1) ||
                     is_character_emoji (uc)))
            uc++;

          if (uc <= iter->blocks[iter->block_index].end)
            {
              iter->uc[0] = uc;
              iter->uc_length = 1;
              return TRUE;
            }
        }
    }

  /* Then go through emoji */
  while (iter->emoji_index < iter->emoji_count)
    {
      const struct EmojiCharacter *emoji;

      if (iter->emoji_indices)
        {
          size_t index = iter->emoji_indices[iter->emoji_index++];
          emoji = &emoji_characters[index];
        }
      else
        {
          emoji = &emoji_characters[iter->emoji_index++];
        }

      if (FALSE && iter->only_composite && emoji->length == 1)
        continue;

      if (iter->filter (iter, emoji->uc, emoji->length))
        {
          memcpy (iter->uc, emoji->uc, emoji->length * sizeof(gunichar));
          iter->uc_length = emoji->length;

          return TRUE;
        }
    }

  return FALSE;
}

static gunichar *
gc_character_iter_get (GcCharacterIter *iter, gssize *length)
{
  *length = iter->uc_length;
  return iter->uc;
}

static void
gc_character_iter_init (GcCharacterIter *iter)
{
  memset (iter, 0, sizeof (GcCharacterIter));
  iter->uc[0] = -1;
}

static gboolean
filter_type (GcCharacterIter *iter, const gunichar *uc, int length)
{
  if (length > 1)
    return FALSE;

  return g_unichar_isprint (uc[0]) && g_unichar_type (uc[0]) == iter->type;
}

static void
gc_character_iter_init_for_type (GcCharacterIter *iter,
                                 GUnicodeType     type)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = G_N_ELEMENTS (all_blocks);
  iter->filter = filter_type;
  iter->type = type;
}

static gboolean
filter_is_punctuation (GcCharacterIter *iter, const gunichar *uc, int length)
{
  GUnicodeType type;

  if (length > 1)
    return FALSE;

  if (!g_unichar_isprint (uc[0]))
    return FALSE;

  type = g_unichar_type (uc[0]);

  return type == G_UNICODE_CONNECT_PUNCTUATION ||
         type == G_UNICODE_DASH_PUNCTUATION ||
         type == G_UNICODE_CLOSE_PUNCTUATION ||
         type == G_UNICODE_FINAL_PUNCTUATION ||
         type == G_UNICODE_INITIAL_PUNCTUATION ||
         type == G_UNICODE_OTHER_PUNCTUATION ||
         type == G_UNICODE_OPEN_PUNCTUATION;
}

static void
gc_character_iter_init_for_punctuation (GcCharacterIter *iter)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = G_N_ELEMENTS (all_blocks);
  iter->filter = filter_is_punctuation;
}

static gboolean
filter_is_print (GcCharacterIter *iter, const gunichar *uc, int length)
{
  int i;

  for (i = 0; i < length; i++)
    if (g_unichar_isprint (uc[i]))
      return TRUE;

  return FALSE;
}

static gboolean
filter_all (GcCharacterIter *iter, const gunichar *uc, int length)
{
  return TRUE;
}

static void
gc_character_iter_init_for_blocks (GcCharacterIter    *iter,
                                   const struct Block *blocks,
                                   size_t              block_count)
{
  gc_character_iter_init (iter);
  iter->blocks = blocks;
  iter->block_count = block_count;
  iter->filter = filter_is_print;
}

static gboolean
filter_scripts (GcCharacterIter *iter, const gunichar *uc, int length)
{
  const GUnicodeScript *scripts = iter->scripts;

  if (length > 1)
    return FALSE;

  if (!g_unichar_isprint (uc[0]))
    return FALSE;

  while (*scripts != G_UNICODE_SCRIPT_INVALID_CODE)
    {
      if (g_unichar_get_script (uc[0]) == *scripts)
        return TRUE;
      scripts++;
    }

  return FALSE;
}

static void
gc_character_iter_init_for_scripts (GcCharacterIter      *iter,
                                    const GUnicodeScript *scripts)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = G_N_ELEMENTS (all_blocks);
  iter->filter = filter_scripts;
  iter->scripts = scripts;
}

static void
gc_character_iter_init_for_category (GcCharacterIter *iter,
                                     GcCategory       category)
{
  int i;

  switch (category)
    {
    case GC_CATEGORY_NONE:
      break;

    case GC_CATEGORY_LETTER_PUNCTUATION:
      gc_character_iter_init_for_punctuation (iter);
      return;

    case GC_CATEGORY_LETTER_ARROW:
      {
        static struct Block arrow_blocks[3];
        static gsize arrow_blocks_size = 0;
        static gsize arrow_blocks_initialized = 0;
        if (g_once_init_enter (&arrow_blocks_initialized))
          {
            const struct Block *block;

            /* 2190..21FF; Arrows */
            block = find_block (0x2190);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (struct Block));
            /* 27F0..27FF; Supplemental Arrows-A */
            block = find_block (0x27F0);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (struct Block));
            /* 2900..297F; Supplemental Arrows-B */
            block = find_block (0x2900);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (struct Block));
            g_once_init_leave (&arrow_blocks_initialized, 1);
          }
        gc_character_iter_init_for_blocks (iter,
                                           arrow_blocks,
                                           arrow_blocks_size);
        return;
      }

    case GC_CATEGORY_LETTER_BULLET:
      gc_character_iter_init (iter);
      iter->characters = g_new0 (struct CharacterSequence,
                                 bullet_character_count);
      iter->character_count = bullet_character_count;
      iter->filter = filter_all;

      for (i = 0; i < bullet_character_count; i++)
        {
          iter->characters[i].uc[0] = bullet_characters[i];
          iter->characters[i].length = 1;
        }

      return;

    case GC_CATEGORY_LETTER_PICTURE:
      {
        static struct Block picture_blocks[6];
        static gsize picture_blocks_size = 0;
        static gsize picture_blocks_initialized = 0;
        if (g_once_init_enter (&picture_blocks_initialized))
          {
            const struct Block *block;

            /* 2600..26FF; Miscellaneous Symbols */
            block = find_block (0x2600);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            /* 2700..27BF; Dingbats */
            block = find_block (0x2700);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            /* 1F000..1F02F; Mahjong Tiles */
            block = find_block (0x1F000);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            /* 1F030..1F09F; Domino Tiles */
            block = find_block (0x1F030);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            /* 1F0A0..1F0FF; Playing Cards */
            block = find_block (0x1F0A0);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            /* 1F300..1F5FF; Miscellaneous Symbols and Pictographs */
            block = find_block (0x1F300);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (struct Block));
            g_once_init_leave (&picture_blocks_initialized, 1);
          }
        gc_character_iter_init_for_blocks (iter,
                                           picture_blocks,
                                           picture_blocks_size);
        return;
      }
      break;

    case GC_CATEGORY_LETTER_CURRENCY:
      gc_character_iter_init_for_type (iter, G_UNICODE_CURRENCY_SYMBOL);
      return;

    case GC_CATEGORY_LETTER_MATH:
      gc_character_iter_init_for_type (iter, G_UNICODE_MATH_SYMBOL);
      return;

    case GC_CATEGORY_LETTER_LATIN:
      {
        GUnicodeScript latin_scripts[2];
        latin_scripts[0] = g_unichar_get_script ('A');
        latin_scripts[1] = G_UNICODE_SCRIPT_INVALID_CODE;
        gc_character_iter_init_for_scripts (iter, latin_scripts);
        return;
      }

    case GC_CATEGORY_EMOJI_SMILEYS:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_smileys_characters;
      iter->emoji_count = EMOJI_SMILEYS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_PEOPLE:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_people_characters;
      iter->emoji_count = EMOJI_PEOPLE_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_ANIMALS:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_animals_characters;
      iter->emoji_count = EMOJI_ANIMALS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_FOOD:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_food_characters;
      iter->emoji_count = EMOJI_FOOD_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_ACTIVITIES:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_activities_characters;
      iter->emoji_count = EMOJI_ACTIVITIES_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_TRAVEL:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_travel_characters;
      iter->emoji_count = EMOJI_TRAVEL_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_OBJECTS:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_objects_characters;
      iter->emoji_count = EMOJI_OBJECTS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_SYMBOLS:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_symbols_characters;
      iter->emoji_count = EMOJI_SYMBOLS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_FLAGS:
      gc_character_iter_init (iter);
      iter->emoji_indices = emoji_flags_characters;
      iter->emoji_count = EMOJI_FLAGS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_LETTER:
    case GC_CATEGORY_EMOJI:
      g_assert_not_reached ();
    }

  gc_character_iter_init (iter);
  return;
}

static inline gboolean
parse_hex (const char *str,
           gulong     *out_value)
{
  gulong value = 0;

  if (*str == 0)
    return FALSE;

  for (; *str; str++)
    {
      value *= 16;

      switch (*str)
        {
        case 'A': case 'B': case 'C': case 'D': case 'E': case 'F':
          value += *str - 'A';
          break;

        case 'a': case 'b': case 'c': case 'd': case 'e': case 'f':
          value += *str - 'a';
          break;

        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          value += *str - '0';
          break;

        default:
          return FALSE;
        }
    }

  *out_value = value;

  return TRUE;
}

#define UTF8_LENGTH(Char)              \
  ((Char) < 0x80 ? 1 :                 \
   ((Char) < 0x800 ? 2 :               \
    ((Char) < 0x10000 ? 3 :            \
     ((Char) < 0x200000 ? 4 :          \
      ((Char) < 0x4000000 ? 5 : 6)))))

static gboolean
filter_keywords (GcCharacterIter *iter, const gunichar *uc, int length)
{
  const gchar * const * keywords = iter->keywords;
  const gsize *keywords_lengths = iter->keywords_lengths;
  gchar buffer[UNINAME_MAX+1];

  if (!filter_is_print (iter, uc, length))
    return FALSE;

  /* Special case if KEYWORDS only contains a single word.  */
  if (keywords[0] != NULL && keywords[1] == NULL)
    {
      const char *keyword = keywords[0];
      size_t keyword_length = keywords_lengths[0];
      glong utf8_length = 0;
      gulong hex_value;

      for (int i = 0; i < length; i++)
        utf8_length += UTF8_LENGTH (uc[i]);

      if (utf8_length == keyword_length)
        {
          guint pos = 0;

          for (const char *iter = keyword;
               *iter;
               iter = g_utf8_next_char (iter), pos++)
            {
              if (pos >= length || uc[pos] != g_utf8_get_char (iter))
                goto try_hex_match;
            }

          return TRUE;
        }

    try_hex_match:
      /* Match against the hexadecimal code point.  */
      if (length == 1 &&
          keyword_length <= 6 &&
          parse_hex (keyword, &hex_value) &&
          hex_value == uc[0])
        return TRUE;
    }

  /* Match against the name. */
  if (!get_character_name (uc, length, buffer))
    return FALSE;

  for (guint i = 0; keywords[i] != NULL; i++)
    {
      const gchar *keyword = keywords[i];
      size_t length = keywords_lengths[i];
      gchar *p;

      if (length >= UNINAME_MAX)
        return FALSE;

      p = strstr (buffer, keyword);
      if (!p)
        return FALSE;

      if (iter->flags & GC_SEARCH_FLAG_WORD)
        {
          while (p)
            {
              if (p == buffer || g_ascii_isspace (*(p - 1)))
                break;
              p = strstr (p + 1, keyword);
            }

          if (!p)
            return FALSE;
        }
    }

  return TRUE;
}

static void
gc_character_iter_init_for_keywords (GcCharacterIter     *iter,
                                     const gchar * const *keywords,
                                     const size_t        *keywords_lengths)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = G_N_ELEMENTS (all_blocks);
  iter->emoji_indices = NULL;
  iter->emoji_count = EMOJI_CHARACTER_COUNT;
  iter->only_composite = TRUE;
  iter->filter = filter_keywords;
  iter->keywords = keywords;
  iter->keywords_lengths = keywords_lengths;
}

/**
 * gc_character_is_composite:
 * @chars: (array length=n_chars): a string consisting of UCS-4 characters
 * @n_chars: length of @chars
 *
 * Returns: whether the character is composite
 */
gboolean
gc_character_is_composite (const gunichar *chars,
                           int             n_chars)
{
  return n_chars > 1;
}

/**
 * gc_character_name:
 * @chars: (array length=n_chars): a string consisting of UCS-4 characters
 * @n_chars: length of @chars
 *
 * Returns: (nullable) (transfer full): a newly allocated character name of @uc.
 */
gchar *
gc_character_name (const gunichar *chars,
                   int             n_chars)
{
  gchar buffer[UNINAME_MAX+1];

  if (!get_character_name (chars, n_chars, buffer))
    return NULL;

  return g_strdup (buffer);
}

/**
 * gc_character_is_invisible:
 * @chars: (array length=n_chars): a string consisting of UCS-4 characters
 * @n_chars: length of @chars
 *
 * Returns: %TRUE if @chars consists of invisible characters, %FALSE otherwise.
 */
gboolean
gc_character_is_invisible (const gunichar *chars,
                           int             n_chars)
{
  int i;

  for (i = 0; i < n_chars; i++) {
    if (g_unichar_isgraph (chars[i]))
      return FALSE;
  }

  return TRUE;
}

G_DEFINE_QUARK (gc-search-error-quark, gc_search_error)

G_DEFINE_BOXED_TYPE (GcSearchResult, gc_search_result,
                     g_ptr_array_ref, g_ptr_array_unref);

/**
 * gc_search_result_get:
 * @result: a #GcSearchResult
 * @index: index of the character to get
 *
 * Returns: the character at @index
 */
const char *
gc_search_result_get (GcSearchResult *result, gint index)
{
  g_return_val_if_fail (result, NULL);
  g_return_val_if_fail (0 <= index && index < result->len, NULL);

  return g_ptr_array_index (result, index);
}

typedef enum
  {
    GC_SEARCH_CRITERIA_CATEGORY,
    GC_SEARCH_CRITERIA_KEYWORDS,
    GC_SEARCH_CRITERIA_SCRIPTS,
    GC_SEARCH_CRITERIA_RELATED
  } GcSearchCriteriaType;

struct _GcSearchCriteria
{
  GcSearchCriteriaType type;

  union {
    GcCategory category;
    struct {
      guint n_keywords;
      gchar **keywords;
      size_t *keywords_lengths;
    };
    GUnicodeScript *scripts;
    gchar *related;
  } u;
};

static gpointer
gc_search_criteria_copy (gpointer boxed)
{
  GcSearchCriteria *criteria = g_memdup2 (boxed, sizeof (GcSearchCriteria));

  if (criteria->type == GC_SEARCH_CRITERIA_KEYWORDS)
    {
      criteria->u.n_keywords = criteria->u.n_keywords;
      criteria->u.keywords = g_strdupv (criteria->u.keywords);
      criteria->u.keywords_lengths = g_memdup2 (criteria->u.keywords_lengths,
                                                sizeof (size_t) * criteria->u.n_keywords);
    }
  else if (criteria->type == GC_SEARCH_CRITERIA_RELATED)
    {
      criteria->u.related = g_strdup (criteria->u.related);
    }

  return criteria;
}

static void
gc_search_criteria_free (gpointer boxed)
{
  GcSearchCriteria *criteria = boxed;

  if (criteria->type == GC_SEARCH_CRITERIA_KEYWORDS)
    {
      g_strfreev (criteria->u.keywords);
      g_free (criteria->u.keywords_lengths);
    }
  else if (criteria->type == GC_SEARCH_CRITERIA_RELATED)
    {
      g_free (criteria->u.related);
    }

  g_free (criteria);
}

G_DEFINE_BOXED_TYPE (GcSearchCriteria, gc_search_criteria,
                     gc_search_criteria_copy, gc_search_criteria_free)

/**
 * gc_search_criteria_new_category:
 * @category: a #GcCategory
 *
 * Returns: (transfer full): a new #GcSearchCriteria
 */
GcSearchCriteria *
gc_search_criteria_new_category (GcCategory category)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);
  result->type = GC_SEARCH_CRITERIA_CATEGORY;
  result->u.category = category;
  return result;
}

/**
 * gc_search_criteria_new_keywords:
 * @keywords: (array zero-terminated=1) (element-type utf8): an array of keywords
 *
 * Returns: (transfer full): a new #GcSearchCriteria
 */
GcSearchCriteria *
gc_search_criteria_new_keywords (const gchar * const * keywords)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);

  result->type = GC_SEARCH_CRITERIA_KEYWORDS;

  if (keywords != NULL)
    {
      result->u.n_keywords = g_strv_length ((gchar **)keywords);
      result->u.keywords = g_strdupv ((gchar **) keywords);
      result->u.keywords_lengths = g_new0 (gsize, result->u.n_keywords);
      for (guint i = 0; i < result->u.n_keywords; i++)
        result->u.keywords_lengths[i] = strlen (keywords[i]);
    }

  return result;
}

/**
 * gc_search_criteria_new_scripts:
 * @scripts: (array length=n_scripts): an array of scripts
 * @n_scripts: the length of @scripts
 *
 * Returns: (transfer full): a new #GcSearchCriteria
 */
GcSearchCriteria *
gc_search_criteria_new_scripts (const GUnicodeScript *scripts,
                                size_t                n_scripts)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);

  result->type = GC_SEARCH_CRITERIA_SCRIPTS;

  result->u.scripts = g_new0 (GUnicodeScript, n_scripts + 1);
  memcpy (result->u.scripts, scripts, n_scripts * sizeof (GUnicodeScript));
  result->u.scripts[n_scripts] = G_UNICODE_SCRIPT_INVALID_CODE;

  return result;
}

GcSearchCriteria *
gc_search_criteria_new_related (const gchar *character)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);
  result->type = GC_SEARCH_CRITERIA_RELATED;
  result->u.related = g_strdup (character);
  return result;
}

enum GcSearchState
  {
    GC_SEARCH_STATE_NOT_STARTED,
    GC_SEARCH_STATE_STEP_STARTED,
    GC_SEARCH_STATE_STEP_FINISHED,
    GC_SEARCH_STATE_FINISHED
  };

struct _GcSearchContext
{
  GObject parent;
  GMutex lock;
  enum GcSearchState state;
  GcCharacterIter iter;
  GcSearchCriteria *criteria;
  GcSearchFlag flags;
};

struct SearchData
{
  gunichar uc;
  gint max_matches;
  GcSearchContext *context;
};

static void
search_data_free (struct SearchData *data)
{
  g_clear_object (&data->context);
  g_slice_free (struct SearchData, data);
}

static inline void
append_related_character (GArray         *result,
                          const gunichar *uc,
                          int             length)
{
  struct CharacterSequence sequence;

  memcpy (sequence.uc, uc, length * sizeof (gunichar));
  sequence.length = length;

  g_array_append_val (result, sequence);
}

static void
add_composited (GArray *result, gunichar base,
                const struct Block *blocks, size_t count)
{
  size_t i;

  for (i = 0; i < count; i++)
    {
      const struct Block *block = &blocks[i];
      gunichar uc;

      for (uc = 0; uc < block->end; uc++)
        {
          gunichar decomposition_base, unused;

          g_unichar_decompose (uc, &decomposition_base, &unused);
          if (decomposition_base == base)
            append_related_character (result, &uc, 1);
        }
    }
}

static int
confusable_character_class_compare (const void *a,
                                    const void *b)
{
  const struct ConfusableCharacterClass *ac = a, *bc = b;
  return ac->uc == bc->uc ? 0 : (ac->uc < bc->uc ? -1 : 1);
}

static void
add_confusables (GArray *result, gunichar uc)
{
  struct ConfusableCharacterClass key, *res;

  key.uc = uc;
  res = bsearch (&key, confusable_character_classes,
                 G_N_ELEMENTS (confusable_character_classes),
                 sizeof (*confusable_character_classes),
                 confusable_character_class_compare);
  if (res)
    {
      const struct ConfusableClass *klass = &confusable_classes[res->index];
      int i;

      for (i = klass->offset; i < klass->offset + klass->length; i++)
        append_related_character (result, &confusable_characters[i], 1);
    }
}

static int
sequence_compare (gconstpointer a, gconstpointer b)
{
  const struct CharacterSequence *key = a;
  const struct CharacterSequence *element = b;
  int i;

  for (i = 0; i < MAX (key->length, element->length); i++)
    {
      gunichar auc = i < key->length ? key->uc[i] : 0;
      gunichar buc = i < element->length ? element->uc[i] : 0;

      if (auc < buc)
        return -1;

      if (auc > buc)
        return 1;
    }

  return 0;
}

static void
remove_duplicates (GArray *array)
{
  gint i;

  for (i = 0; i < array->len; i++)
    {
      struct CharacterSequence *start;
      gint j;

      start = &g_array_index (array, struct CharacterSequence, i);
      for (j = i + 1; j < array->len; j++)
        {
          struct CharacterSequence *stop;

          stop = &g_array_index (array, struct CharacterSequence, j);
          if (sequence_compare (start, stop))
            break;
        }
      if (j != i + 1)
        g_array_remove_range (array, i + 1, j - (i + 1));
    }
}

static inline gboolean
check_emoji_exists (const gunichar *uc,
                    int             length)
{
  struct CharacterSequence sequence;
  const struct EmojiCharacter *res;

  memcpy (sequence.uc, uc, length * sizeof (gunichar));
  sequence.length = length;

  res = bsearch (&sequence, emoji_characters,
                 G_N_ELEMENTS (emoji_characters),
                 sizeof (*emoji_characters),
                 emoji_compare);

  return !!res;
}

static inline gboolean
check_emoji_contains_spacer (const gunichar *uc,
                             int             length)
{
  int i;

  for (i = 0; i < length; i++)
    if (uc[i] == 0x200D)
      return TRUE;

  return FALSE;
}

static void
populate_related_characters (GcCharacterIter *iter)
{
  GArray *result;
  gunichar uc;
  gunichar related;
  size_t i, j;

  result = g_array_new (FALSE, FALSE, sizeof (struct CharacterSequence));

  if (iter->uc_length > 1)
    {
      for (i = 0; i < iter->uc_length;)
        for (j = iter->uc_length - i; j > 0; j--)
          {
            /* We don't want to check the whole sequence */
            if (j == iter->uc_length)
              continue;

            if (j > 1 && !check_emoji_exists (&iter->uc[i], j))
              continue;

            if (j > 1 && check_emoji_contains_spacer (&iter->uc[i], j))
              continue;

            append_related_character (result, &iter->uc[i], j);
            i += j;
            break;
          }

      iter->character_count = result->len;
      iter->characters = (struct CharacterSequence *) g_array_free (result, FALSE);

      return;
    }
  else
    {
      struct CharacterSequence variation;

      /* Many emoji are formed as a character + U+FE0F VARIATION SELECTOR-16 */
      variation.uc[0] = *iter->uc;
      variation.uc[1] = 0xFE0F;
      variation.length = 2;

      if (check_emoji_exists (variation.uc, variation.length))
        append_related_character (result, variation.uc, variation.length);
    }

  uc = iter->uc[0];

  related = g_unichar_toupper (uc);
  if (related != uc)
    append_related_character (result, &related, 1);

  related = g_unichar_tolower (uc);
  if (related != uc)
    append_related_character (result, &related, 1);

  related = g_unichar_totitle (uc);
  if (related != uc)
    append_related_character (result, &related, 1);

  if (g_unichar_get_mirror_char (uc, &related) && related != uc)
    append_related_character (result, &related, 1);

  if (g_unichar_isalpha (uc))
    {
      GUnicodeScript script;

      script = g_unichar_get_script (uc);
      if (script)
        {
          if (script == G_UNICODE_SCRIPT_HANGUL)
            {
              /* For Hangul, do full canonical decomposition.  */
              gunichar s = uc;
              gunichar decomposition[3] = { 0, 0, 0 };
              size_t decomposition_length = 3;

              if (g_unichar_fully_decompose (s, FALSE, decomposition,
                                             decomposition_length))
                for (i = 0; i < decomposition_length; i++)
                  {
                    gunichar hangul_jamo = decomposition[i];

                    if (!hangul_jamo)
                      break;

                    append_related_character (result, &hangul_jamo, 1);
                  }
            }
          else
            {
              /* For Latin, Hiragana, and Katakana, first find out the
                 base character, and then find all composited
                 characters whose base character is the one identified
                 by the first step.  */
              gunichar decomposition_base, unused;

              g_unichar_decompose (uc, &decomposition_base, &unused);

              if (decomposition_base != uc)
                append_related_character (result, &decomposition_base, 1);

              if (script == G_UNICODE_SCRIPT_LATIN)
                add_composited (result, decomposition_base,
                                latin_blocks, latin_block_count);
              else if (script == G_UNICODE_SCRIPT_HIRAGANA)
                add_composited (result, decomposition_base,
                                hiragana_blocks, hiragana_block_count);
              else if (script == G_UNICODE_SCRIPT_KATAKANA)
                add_composited (result, decomposition_base,
                                katakana_blocks, katakana_block_count);
            }
        }
    }

  add_confusables (result, uc);

  g_array_sort (result, sequence_compare);
  remove_duplicates (result);

  for (i = 0; i < result->len; i++)
    {
      struct CharacterSequence *puc;

      puc = &g_array_index (result, struct CharacterSequence, i);
      if (puc->length == 1 && puc->uc[0] == uc)
        {
          g_array_remove_index (result, i);
          break;
        }
    }

  iter->character_count = result->len;
  iter->characters = (struct CharacterSequence *) g_array_free (result, FALSE);
}

static size_t
init_blocks (struct Block *blocks, const gunichar *starters, size_t size)
{
  size_t i, count;

  for (i = 0, count = 0; i < size; i++)
    {
      const struct Block *block = find_block (starters[i]);
      if (block)
        memcpy ((struct Block *) &blocks[count++], block, sizeof (struct Block));
    }
  return count;
}

static void
gc_character_iter_init_for_related (GcCharacterIter *iter,
                                    const gchar     *character)
{
  long ucs4_len = 0;
  gunichar *ucs4;

  if (g_once_init_enter (&latin_blocks_initialized))
    {
      latin_block_count =
        init_blocks (latin_blocks, latin_block_starters,
                     LATIN_BLOCK_SIZE);
      g_once_init_leave (&latin_blocks_initialized, 1);
    }

  if (g_once_init_enter (&hiragana_blocks_initialized))
    {
      hiragana_block_count =
        init_blocks (hiragana_blocks, hiragana_block_starters,
                     HIRAGANA_BLOCK_SIZE);
      g_once_init_leave (&hiragana_blocks_initialized, 1);
    }

  if (g_once_init_enter (&katakana_blocks_initialized))
    {
      katakana_block_count =
        init_blocks (katakana_blocks, katakana_block_starters,
                     KATAKANA_BLOCK_SIZE);
      g_once_init_leave (&katakana_blocks_initialized, 1);
    }

  gc_character_iter_init (iter);

  /* The result is 0-terminated, so we have to copy it manually */
  ucs4 = g_utf8_to_ucs4_fast (character, -1, &ucs4_len);

  memcpy (iter->uc, ucs4, ucs4_len * sizeof (gunichar));
  iter->uc_length = ucs4_len;

  populate_related_characters (iter);

  g_free (ucs4);
}

enum {
  SEARCH_CONTEXT_PROP_0,
  SEARCH_CONTEXT_PROP_CRITERIA,
  SEARCH_CONTEXT_PROP_FLAGS,
  SEARCH_CONTEXT_LAST_PROP
};

static GParamSpec *search_context_props[SEARCH_CONTEXT_LAST_PROP] = { NULL, };

G_DEFINE_TYPE (GcSearchContext, gc_search_context, G_TYPE_OBJECT);

static void
gc_search_context_set_property (GObject      *object,
                                guint         prop_id,
                                const GValue *value,
                                GParamSpec   *pspec)
{
  GcSearchContext *context = GC_SEARCH_CONTEXT (object);

  switch (prop_id)
    {
    case SEARCH_CONTEXT_PROP_CRITERIA:
      context->criteria = g_value_dup_boxed (value);
      break;
    case SEARCH_CONTEXT_PROP_FLAGS:
      context->flags = g_value_get_flags (value);
      break;
    default:
      G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
      break;
    }
}

static void
gc_search_context_finalize (GObject *object)
{
  GcSearchContext *context = GC_SEARCH_CONTEXT (object);

  g_mutex_clear (&context->lock);
  g_boxed_free (GC_TYPE_SEARCH_CONTEXT, context->criteria);
  g_free (context->iter.characters);

  G_OBJECT_CLASS (gc_search_context_parent_class)->finalize (object);
}

static void
gc_search_context_class_init (GcSearchContextClass *klass)
{
  GObjectClass *object_class = G_OBJECT_CLASS (klass);

  object_class->set_property = gc_search_context_set_property;
  object_class->finalize = gc_search_context_finalize;

  search_context_props[SEARCH_CONTEXT_PROP_CRITERIA] =
    g_param_spec_boxed ("criteria", NULL, NULL,
                        GC_TYPE_SEARCH_CRITERIA,
                        G_PARAM_CONSTRUCT_ONLY | G_PARAM_WRITABLE);
  search_context_props[SEARCH_CONTEXT_PROP_FLAGS] =
    g_param_spec_flags ("flags", NULL, NULL,
                        GC_TYPE_SEARCH_FLAG,
                        GC_SEARCH_FLAG_NONE,
                        G_PARAM_CONSTRUCT_ONLY | G_PARAM_WRITABLE);
  g_object_class_install_properties (object_class, SEARCH_CONTEXT_LAST_PROP,
                                     search_context_props);
}

static void
gc_search_context_init (GcSearchContext *context)
{
  g_mutex_init (&context->lock);
}

GcSearchContext *
gc_search_context_new (GcSearchCriteria *criteria,
                       GcSearchFlag      flags)
{
  return g_object_new (GC_TYPE_SEARCH_CONTEXT,
                       "criteria", criteria,
                       "flags", flags,
                       NULL);
}

static void
gc_search_context_search_thread (GTask        *task,
                                 gpointer      source_object,
                                 gpointer      task_data,
                                 GCancellable *cancellable)
{
  GPtrArray *result;
  struct SearchData *data = task_data;
  guint iterations = 0;

  result = g_ptr_array_new_with_free_func (g_free);
  while (gc_character_iter_next (&data->context->iter))
    {
      gunichar *uc;
      gssize len;
      char *utf8;
      GError *error = NULL;

      if (iterations % 2048 == 0 &&
          g_task_return_error_if_cancelled (task))
        {
          g_mutex_lock (&data->context->lock);
          data->context->state = GC_SEARCH_STATE_NOT_STARTED;
          g_mutex_unlock (&data->context->lock);
          return;
        }

      if (result->len == data->max_matches)
        {
          g_mutex_lock (&data->context->lock);
          data->context->state = GC_SEARCH_STATE_STEP_FINISHED;
          g_mutex_unlock (&data->context->lock);

          g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
          return;
        }

      uc = gc_character_iter_get (&data->context->iter, &len);
      utf8 = g_ucs4_to_utf8 (uc, len, NULL, NULL, &error);

      if (error)
        {
          g_critical ("Couldn't convert string to UTF-8: %s", error->message);
          g_clear_error (&error);
          continue;
        }

      g_ptr_array_add (result, utf8);

      iterations++;
    }

  g_mutex_lock (&data->context->lock);
  data->context->state = GC_SEARCH_STATE_FINISHED;
  g_mutex_unlock (&data->context->lock);

  g_task_return_pointer (task, result, (GDestroyNotify) g_ptr_array_unref);
}

void
gc_search_context_search  (GcSearchContext    *context,
                           gint                max_matches,
                           GCancellable       *cancellable,
                           GAsyncReadyCallback callback,
                           gpointer            user_data)
{
  GTask *task;
  struct SearchData *data;

  g_mutex_lock (&context->lock);
  task = g_task_new (context, cancellable, callback, user_data);
  switch (context->state)
    {
    case GC_SEARCH_STATE_NOT_STARTED:
      switch (context->criteria->type)
        {
        case GC_SEARCH_CRITERIA_CATEGORY:
          gc_character_iter_init_for_category (&context->iter,
                                               context->criteria->u.category);
          break;
        case GC_SEARCH_CRITERIA_KEYWORDS:
          gc_character_iter_init_for_keywords (&context->iter,
                                               (const gchar * const *) context->criteria->u.keywords,
                                               context->criteria->u.keywords_lengths);
          break;
        case GC_SEARCH_CRITERIA_SCRIPTS:
          gc_character_iter_init_for_scripts (&context->iter,
                                              context->criteria->u.scripts);
          break;
        case GC_SEARCH_CRITERIA_RELATED:
          gc_character_iter_init_for_related (&context->iter,
                                              context->criteria->u.related);
        }
      context->state = GC_SEARCH_STATE_STEP_STARTED;
      break;

    case GC_SEARCH_STATE_STEP_STARTED:
      g_mutex_unlock (&context->lock);
      g_task_return_new_error (task,
                               GC_SEARCH_ERROR,
                               GC_SEARCH_ERROR_INVALID_STATE,
                               "search step already started");
      return;

    case GC_SEARCH_STATE_STEP_FINISHED:
      break;

    case GC_SEARCH_STATE_FINISHED:
      g_mutex_unlock (&context->lock);
      g_task_return_new_error (task,
                               GC_SEARCH_ERROR,
                               GC_SEARCH_ERROR_INVALID_STATE,
                               "search context destroyed");
      return;
    }
  context->iter.flags = context->flags;
  g_mutex_unlock (&context->lock);

  data = g_slice_new0 (struct SearchData);
  data->context = g_object_ref (context);
  data->max_matches = max_matches;
  g_task_set_task_data (task, data, (GDestroyNotify) search_data_free);
  g_task_run_in_thread (task, gc_search_context_search_thread);
}

/**
 * gc_search_context_search_finish:
 * @context: a #GcSearchContext.
 * @result: a #GAsyncResult.
 * @error: return location of an error.
 *
 * Returns: (transfer full): an array of characters.
 */
GcSearchResult *
gc_search_context_search_finish (GcSearchContext *context,
                                 GAsyncResult    *result,
                                 GError         **error)
{
  g_return_val_if_fail (g_task_is_valid (result, context), NULL);

  return g_task_propagate_pointer (G_TASK (result), error);
}

gboolean
gc_search_context_is_finished (GcSearchContext *context)
{
  return context->state == GC_SEARCH_STATE_FINISHED;
}

/**
 * gc_get_current_language:
 *
 * Returns: (transfer full): an ISO639 two-letter language code
 */
gchar *
gc_get_current_language (void)
{
  const gchar *locale = setlocale (LC_MESSAGES, NULL);
  size_t length;

  if (!locale || !*locale)
    return NULL;

  length = strcspn (locale, "_.@");

  return g_strndup (locale, length);
}

static int
language_scripts_compare (const void *a,
                          const void *b)
{
  const struct LanguageScripts *al = a, *bl = b;
  return strcmp (al->language, bl->language);
}

static int
language_scripts_compare_ignore_territory (const void *a,
                                           const void *b)
{
  const struct LanguageScripts *al = a, *bl = b;
  int an, bn;
  gchar *p;

  p = strchr (al->language, '_');
  an = p ? p - al->language : strlen (al->language);
  p = strchr (bl->language, '_');
  bn = p ? p - bl->language : strlen (bl->language);

  if (an == bn)
    return strncmp (al->language, bl->language, an);

  return language_scripts_compare (a, b);
}

static int
language_aliases_compare (const void *a,
                          const void *b)
{
  const struct LanguageAlias *al = a, *bl = b;
  return strcmp (al->alias, bl->alias);
}

static gchar *
canonicalize_language (const gchar *language)
{
  struct LanguageAlias key, *res;

  key.alias = language;

  res = bsearch (&key, language_aliases,
                 G_N_ELEMENTS (language_aliases),
                 sizeof (*language_aliases),
                 language_aliases_compare);

  if (res)
    return g_strdup (res->replacement);

  return g_strdup (language);
}

/**
 * gc_get_scripts_for_language:
 * @language: a language name
 * @n_scripts: (out): length of the returned value
 *
 * Returns: (transfer full) (array length=n_scripts): a list of script names.
 */
GUnicodeScript *
gc_get_scripts_for_language (const gchar *language,
                             size_t      *n_scripts)
{
  struct LanguageScripts key, *res;
  gchar *canonicalized = canonicalize_language (language);

  key.language = canonicalized;
  res = bsearch (&key, language_scripts,
                 G_N_ELEMENTS (language_scripts),
                 sizeof (*language_scripts),
                 language_scripts_compare);
  if (!res)
    res = bsearch (&key, language_scripts,
                   G_N_ELEMENTS (language_scripts),
                   sizeof (*language_scripts),
                   language_scripts_compare_ignore_territory);

  g_free (canonicalized);

  if (res)
    {
      GUnicodeScript *ret;
      size_t i, n = 0;

      while (res->iso15924[n])
        n++;

      ret = g_new(GUnicodeScript, n);
      *n_scripts = n;

      for (i = 0; i < n; i++)
        ret[i] = g_unicode_script_from_iso15924 (res->iso15924[i]);

      return ret;
    }

  *n_scripts = 0;

  return NULL;
}
