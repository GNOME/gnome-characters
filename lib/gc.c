#include <config.h>

#include "gc.h"

#include <glib/gi18n.h>
#include <langinfo.h>
#include <locale.h>
#include <stdlib.h>
#include <string.h>
#include <unicase.h>
#include <unictype.h>
#include <uniname.h>
#include <uninorm.h>
#include <unistr.h>
#include <uniwidth.h>
#include "confusables.h"
#include "emoji.h"
#include "scripts.h"

#define PANGO_ENABLE_ENGINE 1
#include <pango/pangofc-font.h>

static gsize all_blocks_initialized;
static const uc_block_t *all_blocks;
static size_t all_block_count;

#define LATIN_BLOCK_SIZE 4
static gsize latin_blocks_initialized;
static const uc_block_t latin_blocks[LATIN_BLOCK_SIZE];
static const ucs4_t latin_block_starters[LATIN_BLOCK_SIZE] =
  { 0x0000, 0x0080, 0x0100, 0x0180 };
static size_t latin_block_count;

#define HIRAGANA_BLOCK_SIZE 1
static gsize hiragana_blocks_initialized;
static const uc_block_t hiragana_blocks[HIRAGANA_BLOCK_SIZE];
static const ucs4_t hiragana_block_starters[HIRAGANA_BLOCK_SIZE] =
  { 0x3040 };
static size_t hiragana_block_count;

#define KATAKANA_BLOCK_SIZE 2
static gsize katakana_blocks_initialized;
static const uc_block_t katakana_blocks[KATAKANA_BLOCK_SIZE];
static const ucs4_t katakana_block_starters[KATAKANA_BLOCK_SIZE] =
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

typedef struct GcCharacterIter GcCharacterIter;

struct GcCharacterIter
{
  ucs4_t uc;

  const gunichar *characters;
  gssize character_index;
  gssize character_count;

  const uc_block_t *blocks;
  size_t block_index;
  size_t block_count;

  const uc_script_t * const * scripts;
  uc_general_category_t category;
  const gchar * const * keywords;
  GcSearchFlag flags;

  gboolean (* filter) (GcCharacterIter *iter, ucs4_t uc);
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
  ucs4_t uc = iter->uc;

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
          uc = UNINAME_INVALID;
        }

      if (uc == UNINAME_INVALID)
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
  iter->uc = UNINAME_INVALID;
}

static gboolean
filter_category (GcCharacterIter *iter, ucs4_t uc)
{
  return uc_is_print (uc) && uc_is_general_category (uc, iter->category);
}

static void
gc_character_iter_init_for_general_category (GcCharacterIter      *iter,
                                             uc_general_category_t category)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_category;
  iter->category = category;
}

static gboolean
filter_is_print (GcCharacterIter *iter, ucs4_t uc)
{
  return uc_is_print (uc);
}

static gboolean
filter_all (GcCharacterIter *iter, ucs4_t uc)
{
  return TRUE;
}

static void
gc_character_iter_init_for_blocks (GcCharacterIter  *iter,
                                   const uc_block_t *blocks,
                                   size_t            block_count)
{
  gc_character_iter_init (iter);
  iter->blocks = blocks;
  iter->block_count = block_count;
  iter->filter = filter_is_print;
}

static gboolean
filter_scripts (GcCharacterIter *iter, ucs4_t uc)
{
  const uc_script_t * const *scripts = iter->scripts;

  if (!uc_is_print (uc))
    return FALSE;

  while (*scripts)
    {
      if (uc_is_script (uc, *scripts))
        return TRUE;
      scripts++;
    }

  return FALSE;
}

static void
gc_character_iter_init_for_scripts (GcCharacterIter   *iter,
                                    const uc_script_t * const * scripts)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_scripts;
  iter->scripts = scripts;
}

static void
gc_character_iter_init_for_category (GcCharacterIter *iter,
                                     GcCategory       category)
{
  if (g_once_init_enter (&all_blocks_initialized))
    {
      uc_all_blocks (&all_blocks, &all_block_count);
      g_once_init_leave (&all_blocks_initialized, 1);
    }

  switch (category)
    {
    case GC_CATEGORY_NONE:
      break;

    case GC_CATEGORY_LETTER_PUNCTUATION:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_P);
      return;

    case GC_CATEGORY_LETTER_ARROW:
      {
        static uc_block_t arrow_blocks[3];
        static gsize arrow_blocks_size = 0;
        static gsize arrow_blocks_initialized = 0;
        if (g_once_init_enter (&arrow_blocks_initialized))
          {
            const uc_block_t *block;

            /* 2190..21FF; Arrows */
            block = uc_block (0x2190);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 27F0..27FF; Supplemental Arrows-A */
            block = uc_block (0x27F0);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 2900..297F; Supplemental Arrows-B */
            block = uc_block (0x2900);
            if (block)
              memcpy (&arrow_blocks[arrow_blocks_size++], block,
                      sizeof (uc_block_t));
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
        static uc_block_t picture_blocks[6];
        static gsize picture_blocks_size = 0;
        static gsize picture_blocks_initialized = 0;
        if (g_once_init_enter (&picture_blocks_initialized))
          {
            const uc_block_t *block;

            /* 2600..26FF; Miscellaneous Symbols */
            block = uc_block (0x2600);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 2700..27BF; Dingbats */
            block = uc_block (0x2700);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 1F000..1F02F; Mahjong Tiles */
            block = uc_block (0x1F000);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 1F030..1F09F; Domino Tiles */
            block = uc_block (0x1F030);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 1F0A0..1F0FF; Playing Cards */
            block = uc_block (0x1F0A0);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            /* 1F300..1F5FF; Miscellaneous Symbols and Pictographs */
            block = uc_block (0x1F300);
            if (block)
              memcpy (&picture_blocks[picture_blocks_size++], block,
                      sizeof (uc_block_t));
            g_once_init_leave (&picture_blocks_initialized, 1);
          }
        gc_character_iter_init_for_blocks (iter,
                                           picture_blocks,
                                           picture_blocks_size);
        return;
      }
      break;

    case GC_CATEGORY_LETTER_CURRENCY:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_Sc);
      return;

    case GC_CATEGORY_LETTER_MATH:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_Sm);
      return;

    case GC_CATEGORY_LETTER_LATIN:
      {
        static const uc_script_t *latin_scripts[2];
        latin_scripts[0] = uc_script ('A');
        latin_scripts[1] = NULL;
        gc_character_iter_init_for_scripts (iter, latin_scripts);
        return;
      }

    case GC_CATEGORY_EMOJI_SMILEYS:
      gc_character_iter_init (iter);
      iter->characters = emoji_smileys_characters;
      iter->character_count = EMOJI_SMILEYS_CHARACTER_COUNT;
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
    }

  gc_character_iter_init (iter);
  return;
}

static gboolean
filter_keywords (GcCharacterIter *iter, ucs4_t uc)
{
  const gchar * const * keywords = iter->keywords;
  gchar buffer[UNINAME_MAX];

  if (!uc_is_print (uc))
    return FALSE;

  /* Special case if KEYWORDS only contains a single word.  */
  if (*keywords && *(keywords + 1) == NULL)
    {
      size_t length = strlen (*keywords);
      uint8_t utf8[6];
      size_t utf8_length = G_N_ELEMENTS (utf8);

      /* Match against the character itself.  */
      u32_to_u8 (&uc, 1, utf8, &utf8_length);
      if (utf8_length == length && memcmp (*keywords, utf8, utf8_length) == 0)
        return TRUE;

      /* Match against the hexadecimal code point.  */
      if (length <= 6
          && strspn (*keywords, "0123456789abcdefABCDEF") == length
          && strtoul (*keywords, NULL, 16) == uc)
        return TRUE;
    }

  /* Match against the name.  */
  if (!unicode_character_name (uc, buffer))
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
  if (g_once_init_enter (&all_blocks_initialized))
    {
      uc_all_blocks (&all_blocks, &all_block_count);
      g_once_init_leave (&all_blocks_initialized, 1);
    }

  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
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
  const uc_block_t *block;
  static const uc_block_t *cjk_blocks[6];
  static gsize cjk_blocks_initialized = 0;
  gsize i;

  if (g_once_init_enter (&cjk_blocks_initialized))
    {
      static const ucs4_t cjk_block_starters[6] =
        {
          0x4E00, 0x3400, 0x20000, 0x2A700, 0x2B740, 0x2B820
        };

      for (i = 0; i < G_N_ELEMENTS (cjk_block_starters); i++)
        cjk_blocks[i] = uc_block (cjk_block_starters[i]);
      g_once_init_leave (&cjk_blocks_initialized, 1);
    }

  block = uc_block (uc);
  for (i = 0; i < G_N_ELEMENTS (cjk_blocks); i++)
    if (block == cjk_blocks[i])
      return g_strdup_printf ("CJK UNIFIED IDEOGRAPH-%X", uc);

  return unicode_character_name (uc, g_new0 (gchar, UNINAME_MAX));
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
  return uc_is_property_space (uc)
    || uc_is_property_iso_control (uc)
    || uc_is_property_format_control (uc)
    || uc_is_property_zero_width (uc);
}

/**
 * gc_character_width:
 * @uc: a UCS-4 character
 *
 * Returns: column width of @uc, or -1 if @uc is a control character.
 */
gint
gc_character_width (gunichar uc)
{
  return uc_width (uc, "UTF-8");
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
    const uc_script_t **scripts;
    gunichar related;
  } u;
};

static gpointer
gc_search_criteria_copy (gpointer boxed)
{
  GcSearchCriteria *criteria = g_memdup (boxed, sizeof (GcSearchCriteria));

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
 * @scripts: (array zero-terminated=1) (element-type utf8): an array of scripts
 *
 * Returns: (transfer full): a new #GcSearchCriteria
 */
GcSearchCriteria *
gc_search_criteria_new_scripts (const gchar * const * scripts)
{
  GcSearchCriteria *result = g_new0 (GcSearchCriteria, 1);
  guint length, i;

  result->type = GC_SEARCH_CRITERIA_SCRIPTS;

  length = g_strv_length ((gchar **) scripts);
  result->u.scripts = g_malloc0_n (length + 1, sizeof (uc_script_t *));
  for (i = 0; i < length; i++)
    result->u.scripts[i] = uc_script_byname (scripts[i]);

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
add_composited (GArray *result, ucs4_t base,
                const uc_block_t *blocks, size_t count)
{
  size_t i;

  for (i = 0; i < count; i++)
    {
      const uc_block_t *block = &blocks[i];
      ucs4_t uc;

      for (uc = 0; uc < block->end; uc++)
        {
          ucs4_t decomposition[UC_DECOMPOSITION_MAX_LENGTH];

          uc_canonical_decomposition (uc, decomposition);
          if (decomposition[0] == base)
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
add_confusables (GArray *result, ucs4_t uc)
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
  ucs4_t related;
  size_t i;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));

  related = uc_toupper (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  related = uc_tolower (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  related = uc_totitle (iter->uc);
  if (related != iter->uc)
    g_array_append_val (result, related);

  if (uc_mirror_char (iter->uc, &related) && related != iter->uc)
    g_array_append_val (result, related);

  if (uc_is_general_category (iter->uc, UC_CATEGORY_L))
    {
      const uc_script_t *script;

      script = uc_script (iter->uc);
      if (script)
        {
          if (strcmp (script->name, "Hangul") == 0)
            {
              /* For Hangul, do full canonical decomposition.  */
              uint32_t s = (uint32_t) iter->uc;
              uint32_t decomposition[3];
              size_t decomposition_length = 3;

              if (u32_normalize (UNINORM_NFD, &s, 1,
                                 decomposition, &decomposition_length))
                for (i = 0; i < decomposition_length; i++)
                  {
                    ucs4_t hangul_jamo = (ucs4_t) decomposition[i];
                    g_array_append_val (result, hangul_jamo);
                  }
            }
          else
            {
              /* For Latin, Hiragana, and Katakana, first find out the
                 base character, and then find all composited
                 characters whose base character is the one identified
                 by the first step.  */
              ucs4_t decomposition[UC_DECOMPOSITION_MAX_LENGTH];
              int decomposition_length;
              ucs4_t decomposition_base;

              decomposition_length =
                uc_canonical_decomposition (iter->uc, decomposition);
              if (decomposition_length > 0)
                {
                  decomposition_base = decomposition[0];
                  if (decomposition_base != iter->uc)
                    g_array_append_val (result, decomposition_base);
                }
              else
                decomposition_base = iter->uc;

              if (strcmp (script->name, "Latin") == 0)
                add_composited (result, decomposition_base,
                                latin_blocks, latin_block_count);
              else if (strcmp (script->name, "Hiragana") == 0)
                add_composited (result, decomposition_base,
                                hiragana_blocks, hiragana_block_count);
              else if (strcmp (script->name, "Katakana") == 0)
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
init_blocks (const uc_block_t *blocks, const ucs4_t *starters, size_t size)
{
  size_t i, count;

  for (i = 0, count = 0; i < size; i++)
    {
      const uc_block_t *block = uc_block (starters[i]);
      if (block)
        memcpy ((uc_block_t *) &blocks[count++], block, sizeof (uc_block_t));
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

  if (g_once_init_enter (&all_blocks_initialized))
    {
      uc_all_blocks (&all_blocks, &all_block_count);
      g_once_init_leave (&all_blocks_initialized, 1);
    }

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

static int
filter_compare (const void *a, const void *b)
{
  const uint32_t *ac = a, *bc = b;
  return *ac == *bc ? 0 : (*ac < *bc ? -1 : 1);
}

/**
 * gc_filter_characters:
 * @category: a #GcCategory.
 * @characters: (array zero-terminated=1) (element-type utf8): an array of characters
 *
 * Returns: (transfer full): an array of characters.
 */
GcSearchResult *
gc_filter_characters (GcCategory           category,
                      const gchar * const *characters)
{
  static const struct {
    const uint32_t *table;
    size_t length;
  } emoji_tables[] = {
    { emoji_smileys_characters, EMOJI_SMILEYS_CHARACTER_COUNT },
    { emoji_animals_characters, EMOJI_ANIMALS_CHARACTER_COUNT },
    { emoji_food_characters, EMOJI_FOOD_CHARACTER_COUNT },
    { emoji_travel_characters, EMOJI_TRAVEL_CHARACTER_COUNT },
    { emoji_activities_characters, EMOJI_ACTIVITIES_CHARACTER_COUNT },
    { emoji_objects_characters, EMOJI_OBJECTS_CHARACTER_COUNT },
    { emoji_symbols_characters, EMOJI_SYMBOLS_CHARACTER_COUNT },
    { emoji_flags_characters, EMOJI_FLAGS_CHARACTER_COUNT }
  };
  GArray *result;
  size_t i, j;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));

  g_return_val_if_fail (category == GC_CATEGORY_LETTER || category == GC_CATEGORY_EMOJI, result);

  for (i = 0; characters[i] != 0; i++)
    {
      const uint8_t *utf8 = characters[i];
      size_t utf8_length = u8_strmblen (utf8);
      uint32_t uc;
      size_t uc_length = 1;

      u8_to_u32 (utf8, utf8_length, &uc, &uc_length);
      for (j = 0; j < G_N_ELEMENTS(emoji_tables); j++)
	{
	  uint32_t *res;
	  res = bsearch (&uc, emoji_tables[j].table, emoji_tables[j].length,
			 sizeof (uint32_t),
			 filter_compare);
	  if (res)
	    {
	      if (category == GC_CATEGORY_EMOJI)
		g_array_append_val (result, uc);
	      break;
	    }
	}
      if (j == G_N_ELEMENTS(emoji_tables) && category == GC_CATEGORY_LETTER)
	g_array_append_val (result, uc);
    }

  return result;
}

/**
 * gc_gtk_clipboard_get:
 *
 * Returns: (transfer none): a #GtkClipboard.
 */
GtkClipboard *
gc_gtk_clipboard_get (void)
{
  return gtk_clipboard_get (GDK_SELECTION_CLIPBOARD);
}

void
gc_pango_layout_disable_fallback (PangoLayout *layout)
{
  PangoAttrList *attr_list;

  attr_list = pango_layout_get_attributes (layout);
  if (!attr_list)
    {
      attr_list = pango_attr_list_new ();
      pango_layout_set_attributes (layout, attr_list);
    }
  pango_attr_list_insert (attr_list, pango_attr_fallback_new (FALSE));
}

gboolean
gc_pango_context_font_has_glyph (PangoContext *context,
                                 PangoFont    *font,
                                 gunichar      uc)
{
  PangoLayout *layout;
  GError *error;
  gchar *utf8;
  glong items_written;
  int retval;

#ifdef HAVE_PANGOFT2
  if (PANGO_IS_FC_FONT (font))
    /* Fast path when the font is loaded as PangoFcFont.  */
    {
      PangoFcFont *fcfont = PANGO_FC_FONT (font);
      return pango_fc_font_has_char (fcfont, uc);
    }
#endif

  /* Slow path performing actual rendering.  */
  utf8 = g_ucs4_to_utf8 (&uc, 1, NULL, &items_written, &error);
  if (!utf8)
    {
      g_printerr ("error in decoding: %s\n", error->message);
      g_error_free (error);
      return FALSE;
    }

  layout = pango_layout_new (context);
  gc_pango_layout_disable_fallback (layout);
  pango_layout_set_text (layout, utf8, items_written);
  g_free (utf8);

  retval = pango_layout_get_unknown_glyphs_count (layout);
  g_object_unref (layout);

  return retval == 0;
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
 *
 * Returns: (transfer none) (array zero-terminated=1) (element-type utf8): a list of script names.
 */
const gchar * const *
gc_get_scripts_for_language (const gchar *language)
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
    return res->scripts;

  return NULL;
}
