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

static char *
get_character_name (gunichar  uc,
                    gchar    *buffer)
{
  struct CharacterName *res;
  const struct Block *block;
  static struct Block *cjk_blocks[8];
  static struct Block *tangut_blocks[2];
  static struct Block *hangul_block;
  static gsize local_blocks_initialized = 0;
  gsize i;

  if (g_once_init_enter (&local_blocks_initialized))
    {
      static const gunichar cjk_block_starters[8] =
        {
          0x4E00, 0x3400, 0x20000, 0x2A700, 0x2B740, 0x2B820, 0x2CEB0, 0x30000
        };

      static const gunichar tangut_block_starters[2] =
        {
          0x17000, 0x18D00
        };

      for (i = 0; i < G_N_ELEMENTS (cjk_block_starters); i++)
        cjk_blocks[i] = (struct Block *)find_block (cjk_block_starters[i]);

      for (i = 0; i < G_N_ELEMENTS (tangut_block_starters); i++)
        tangut_blocks[i] = (struct Block *)find_block (tangut_block_starters[i]);

      hangul_block = (struct Block *)find_block (0xAC00);

      g_once_init_leave (&local_blocks_initialized, 1);
    }

  block = find_block (uc);
  for (i = 0; i < G_N_ELEMENTS (cjk_blocks); i++)
    if (block == cjk_blocks[i])
      {
        snprintf (buffer, UNINAME_MAX, "CJK UNIFIED IDEOGRAPH-%X", uc);
        return buffer;
      }

  for (i = 0; i < G_N_ELEMENTS (tangut_blocks); i++)
    if (block == tangut_blocks[i])
      {
        snprintf (buffer, UNINAME_MAX, "TANGUT IDEOGRAPH-%X", uc);
        return buffer;
      }

  if (block == hangul_block)
    {
      gunichar decomposition[3] = { 0, 0, 0 };
      size_t decomposition_length = 3;
      size_t pos;

      memcpy (buffer, "HANGUL SYLLABLE ", 16);
      pos = 16;

      if (g_unichar_fully_decompose (uc, FALSE, decomposition,
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

  res = bsearch (&uc, character_names,
                 G_N_ELEMENTS (character_names),
                 sizeof (*character_names),
                 character_name_compare);
  if (res)
    {
      memcpy (buffer, res->name, strnlen (res->name, UNINAME_MAX));
      return buffer;
    }

  return NULL;
}

typedef struct GcCharacterIter GcCharacterIter;

struct GcCharacterIter
{
  gunichar uc;

  const gunichar *characters;
  gssize character_index;
  gssize character_count;

  const struct Block *blocks;
  size_t block_index;
  size_t block_count;

  const GUnicodeScript *scripts;
  size_t n_scripts;

  GUnicodeType type;
  const gchar * const * keywords;
  GcSearchFlag flags;

  gboolean (* filter) (GcCharacterIter *iter, gunichar uc);
};

static gboolean gc_character_iter_next (GcCharacterIter      *iter);
static gunichar gc_character_iter_get  (GcCharacterIter      *iter);

static void     gc_character_iter_init_for_category
                                       (GcCharacterIter      *iter,
                                        GcCategory            category);

static void     gc_character_iter_init_for_keywords
                                       (GcCharacterIter      *iter,
                                        const gchar * const * keywords);

static gboolean
gc_character_iter_next (GcCharacterIter *iter)
{
  gunichar uc = iter->uc;

  /* First, search in the explicit character list.  */
  if (iter->character_index < iter->character_count)
    {
      iter->uc = iter->characters[iter->character_index++];
      return TRUE;
    }

  /* Then go through the Unicode blocks.  */
  if (!iter->blocks)
    return FALSE;

  while (TRUE)
    {
      if (uc == iter->blocks[iter->block_index].end)
        {
          iter->block_index++;
          uc = -1;
        }

      if (uc == -1)
        {
          while (iter->block_index < iter->block_count
                 && iter->blocks[iter->block_index].start
                 == iter->blocks[iter->block_index].end)
            iter->block_index++;
          if (iter->block_index == iter->block_count)
            return FALSE;
          uc = iter->blocks[iter->block_index].start;
        }
      else
        uc++;

      while (uc < iter->blocks[iter->block_index].end
             && !iter->filter (iter, uc))
        uc++;

      if (uc < iter->blocks[iter->block_index].end)
        {
          iter->uc = uc;
          return TRUE;
        }
    }

  return FALSE;
}

static gunichar
gc_character_iter_get (GcCharacterIter *iter)
{
  return iter->uc;
}

static void
gc_character_iter_init (GcCharacterIter *iter)
{
  memset (iter, 0, sizeof (GcCharacterIter));
  iter->uc = -1;
}

static gboolean
filter_type (GcCharacterIter *iter, gunichar uc)
{
  return g_unichar_isprint (uc) && g_unichar_type (uc) == iter->type;
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
filter_is_punctuation (GcCharacterIter *iter, gunichar uc)
{
  GUnicodeType type;

  if (!g_unichar_isprint (uc))
    return FALSE;

  type = g_unichar_type (uc);

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
filter_is_print (GcCharacterIter *iter, gunichar uc)
{
  return g_unichar_isprint (uc);
}

static gboolean
filter_all (GcCharacterIter *iter, gunichar uc)
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
filter_scripts (GcCharacterIter *iter, gunichar uc)
{
  const GUnicodeScript *scripts = iter->scripts;

  if (!g_unichar_isprint (uc))
    return FALSE;

  while (*scripts != G_UNICODE_SCRIPT_INVALID_CODE)
    {
      if (g_unichar_get_script (uc) == *scripts)
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
      iter->characters = bullet_characters;
      iter->character_count = bullet_character_count;
      iter->filter = filter_all;
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
      iter->characters = emoji_smileys_characters;
      iter->character_count = EMOJI_SMILEYS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_PEOPLE:
      gc_character_iter_init (iter);
      iter->characters = emoji_people_characters;
      iter->character_count = EMOJI_PEOPLE_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_ANIMALS:
      gc_character_iter_init (iter);
      iter->characters = emoji_animals_characters;
      iter->character_count = EMOJI_ANIMALS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_FOOD:
      gc_character_iter_init (iter);
      iter->characters = emoji_food_characters;
      iter->character_count = EMOJI_FOOD_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_ACTIVITIES:
      gc_character_iter_init (iter);
      iter->characters = emoji_activities_characters;
      iter->character_count = EMOJI_ACTIVITIES_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_TRAVEL:
      gc_character_iter_init (iter);
      iter->characters = emoji_travel_characters;
      iter->character_count = EMOJI_TRAVEL_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_OBJECTS:
      gc_character_iter_init (iter);
      iter->characters = emoji_objects_characters;
      iter->character_count = EMOJI_OBJECTS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_SYMBOLS:
      gc_character_iter_init (iter);
      iter->characters = emoji_symbols_characters;
      iter->character_count = EMOJI_SYMBOLS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_EMOJI_FLAGS:
      gc_character_iter_init (iter);
      iter->characters = emoji_flags_characters;
      iter->character_count = EMOJI_FLAGS_CHARACTER_COUNT;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_LETTER:
    case GC_CATEGORY_EMOJI:
      g_assert_not_reached ();
    }

  gc_character_iter_init (iter);
  return;
}

static gboolean
filter_keywords (GcCharacterIter *iter, gunichar uc)
{
  const gchar * const * keywords = iter->keywords;
  gchar buffer[UNINAME_MAX];

  if (!g_unichar_isprint (uc))
    return FALSE;

  /* Special case if KEYWORDS only contains a single word.  */
  if (*keywords && *(keywords + 1) == NULL)
    {
      size_t length = strlen (*keywords);
      char utf8[6];
      size_t utf8_length = G_N_ELEMENTS (utf8);

      /* Match against the character itself.  */
      utf8_length = g_unichar_to_utf8 (uc, utf8);
      if (utf8_length == length && memcmp (*keywords, utf8, utf8_length) == 0)
        return TRUE;

      /* Match against the hexadecimal code point.  */
      if (length <= 6
          && strspn (*keywords, "0123456789abcdefABCDEF") == length
          && strtoul (*keywords, NULL, 16) == uc)
        return TRUE;
    }

  /* Match against the name.  */
  if (!get_character_name (uc, buffer))
    return FALSE;

  while (*keywords)
    {
      const gchar *keyword = *keywords++;
      size_t length = strlen (keyword);
      gchar *p;

      if (length >= UNINAME_MAX)
        return FALSE;

      p = g_strstr_len (buffer, UNINAME_MAX, keyword);
      if (!p)
        return FALSE;

      if (iter->flags & GC_SEARCH_FLAG_WORD)
        {
          while (p)
            {
              if (p == buffer || g_ascii_isspace (*(p - 1)))
                break;
              p = g_strstr_len (p + 1, UNINAME_MAX, keyword);
            }

          if (!p)
            return FALSE;
        }
    }

  return TRUE;
}

static void
gc_character_iter_init_for_keywords (GcCharacterIter      *iter,
                                     const gchar * const * keywords)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = G_N_ELEMENTS (all_blocks);
  iter->filter = filter_keywords;
  iter->keywords = keywords;
}

/**
 * gc_character_name:
 * @uc: a UCS-4 character
 *
 * Returns: (nullable): a newly allocated character name of @uc.
 */
gchar *
gc_character_name (gunichar uc)
{
  return get_character_name (uc, g_new0 (gchar, UNINAME_MAX));
}

/**
 * gc_character_is_invisible:
 * @uc: a UCS-4 character
 *
 * Returns: %TRUE if @uc is an invisible character, %FALSE otherwise.
 */
gboolean
gc_character_is_invisible (gunichar uc)
{
  return g_unichar_isspace (uc) ||
         g_unichar_iscntrl (uc) ||
         g_unichar_iszerowidth (uc);
}

G_DEFINE_QUARK (gc-search-error-quark, gc_search_error)

G_DEFINE_BOXED_TYPE (GcSearchResult, gc_search_result,
                     g_array_ref, g_array_unref);

gunichar
gc_search_result_get (GcSearchResult *result, gint index)
{
  g_return_val_if_fail (result, G_MAXUINT32);
  g_return_val_if_fail (0 <= index && index < result->len, G_MAXUINT32);

  return g_array_index (result, gunichar, index);
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
    gchar **keywords;
    GUnicodeScript *scripts;
    gunichar related;
  } u;
};

static gpointer
gc_search_criteria_copy (gpointer boxed)
{
  GcSearchCriteria *criteria = g_memdup2 (boxed, sizeof (GcSearchCriteria));

  if (criteria->type == GC_SEARCH_CRITERIA_KEYWORDS)
    criteria->u.keywords = g_strdupv (criteria->u.keywords);

  return criteria;
}

static void
gc_search_criteria_free (gpointer boxed)
{
  GcSearchCriteria *criteria = boxed;

  if (criteria->type == GC_SEARCH_CRITERIA_KEYWORDS)
    g_strfreev (criteria->u.keywords);

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
  result->u.keywords = g_strdupv ((gchar **) keywords);
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
gc_search_criteria_new_related (gunichar uc)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);
  result->type = GC_SEARCH_CRITERIA_RELATED;
  result->u.related = uc;
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
            g_array_append_val (result, uc);
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
      g_array_append_vals (result,
                           &confusable_characters[klass->offset],
                           klass->length);
    }
}

static gint
compare_unichar (gconstpointer a,
                 gconstpointer b)
{
  const gunichar *auc = a, *buc = b;
  return *auc == *buc ? 0 : (*auc < *buc ? -1 : 1);
}

static void
remove_duplicates (GArray *array)
{
  gint i;

  for (i = 0; i < array->len; i++)
    {
      gunichar *start;
      gint j;

      start = &g_array_index (array, gunichar, i);
      for (j = i + 1; j < array->len; j++)
        {
          gunichar *stop;

          stop = &g_array_index (array, gunichar, j);
          if (*start != *stop)
            break;
        }
      if (j != i + 1)
        g_array_remove_range (array, i + 1, j - (i + 1));
    }
}

static void
populate_related_characters (GcCharacterIter *iter)
{
  GArray *result;
  gunichar related;
  size_t i;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));

  related = g_unichar_toupper (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  related = g_unichar_tolower (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  related = g_unichar_totitle (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  if (g_unichar_get_mirror_char (iter->uc, &related) && related != iter->uc)
    g_array_append_val (result, related);

  if (g_unichar_isalpha (iter->uc))
    {
      GUnicodeScript script;

      script = g_unichar_get_script (iter->uc);
      if (script)
        {
          if (script == G_UNICODE_SCRIPT_HANGUL)
            {
              /* For Hangul, do full canonical decomposition.  */
              gunichar s = iter->uc;
              gunichar decomposition[3] = { 0, 0, 0 };
              size_t decomposition_length = 3;

              if (g_unichar_fully_decompose (s, FALSE, decomposition,
                                             decomposition_length))
                for (i = 0; i < decomposition_length; i++)
                  {
                    gunichar hangul_jamo = decomposition[i];

                    if (!hangul_jamo)
                      break;

                    g_array_append_val (result, hangul_jamo);
                  }
            }
          else
            {
              /* For Latin, Hiragana, and Katakana, first find out the
                 base character, and then find all composited
                 characters whose base character is the one identified
                 by the first step.  */
              gunichar decomposition_base, unused;

              g_unichar_decompose (iter->uc, &decomposition_base, &unused);

              if (decomposition_base != iter->uc)
                g_array_append_val (result, decomposition_base);

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

  add_confusables (result, iter->uc);

  g_array_sort (result, compare_unichar);
  remove_duplicates (result);

  for (i = 0; i < result->len; i++)
    {
      gunichar *puc;

      puc = &g_array_index (result, gunichar, i);
      if (*puc == iter->uc)
        {
          g_array_remove_index (result, i);
          break;
        }
    }

  iter->character_count = result->len;
  iter->characters = (gunichar *) g_array_free (result, FALSE);
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
                                    gunichar         uc)
{
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
  iter->uc = uc;
  populate_related_characters (iter);
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
  GArray *result;
  struct SearchData *data = task_data;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));
  while (gc_character_iter_next (&data->context->iter))
    {
      gunichar uc;

      if (g_task_return_error_if_cancelled (task))
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

      uc = gc_character_iter_get (&data->context->iter);
      g_array_append_val (result, uc);
    }

  g_mutex_lock (&data->context->lock);
  data->context->state = GC_SEARCH_STATE_FINISHED;
  g_mutex_unlock (&data->context->lock);

  g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
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
                                               (const gchar * const *) context->criteria->u.keywords);
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

  key.language = language;
  res = bsearch (&key, language_scripts,
                 G_N_ELEMENTS (language_scripts),
                 sizeof (*language_scripts),
                 language_scripts_compare);
  if (!res)
    res = bsearch (&key, language_scripts,
                   G_N_ELEMENTS (language_scripts),
                   sizeof (*language_scripts),
                   language_scripts_compare_ignore_territory);

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
