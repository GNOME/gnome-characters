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
#include "confusables.h"
#include "scripts.h"

#define PANGO_ENABLE_ENGINE 1
#include <pango/pangofc-font.h>
#include <harfbuzz/hb-ft.h>
#include <harfbuzz/hb-ot.h>

static const uc_block_t *all_blocks;
static size_t all_block_count;

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

  gboolean (* filter) (GcCharacterIter *iter, ucs4_t uc);
};

static gboolean gc_character_iter_next (GcCharacterIter      *iter);
static gunichar gc_character_iter_get  (GcCharacterIter      *iter);

static void     gc_enumerate_character_by_category
                                       (GcCharacterIter      *iter,
                                        GcCategory            category);

static void     gc_enumerate_character_by_keywords
                                       (GcCharacterIter      *iter,
                                        const gchar * const * keywords);

static gboolean
gc_character_iter_next (GcCharacterIter *iter)
{
  ucs4_t uc = iter->uc;

  /* First search in the explicit character list.  */
  if (iter->character_index + 1 < iter->character_count)
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
gc_enumerate_character_by_category (GcCharacterIter *iter,
                                    GcCategory       category)
{
  if (!all_blocks)
    uc_all_blocks (&all_blocks, &all_block_count);

  switch (category)
    {
    case GC_CATEGORY_NONE:
      break;

    case GC_CATEGORY_PUNCTUATION:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_P);
      return;

    case GC_CATEGORY_ARROW:
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

    case GC_CATEGORY_BULLET:
      gc_character_iter_init (iter);
      iter->characters = bullet_characters;
      iter->character_count = bullet_character_count;
      iter->filter = filter_all;
      return;

    case GC_CATEGORY_PICTURE:
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

    case GC_CATEGORY_CURRENCY:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_Sc);
      return;

    case GC_CATEGORY_MATH:
      gc_character_iter_init_for_general_category (iter, UC_CATEGORY_Sm);
      return;

    case GC_CATEGORY_LATIN:
      {
        static const uc_script_t *latin_scripts[2];
        latin_scripts[0] = uc_script ('A');
        latin_scripts[1] = NULL;
        gc_character_iter_init_for_scripts (iter, latin_scripts);
        return;
      }

    case GC_CATEGORY_EMOTICON:
      {
        static uc_block_t emoticon_blocks[1];
        static gsize emoticon_blocks_size = 0;
        static gsize emoticon_blocks_initialized = 0;
        if (g_once_init_enter (&emoticon_blocks_initialized))
          {
            const uc_block_t *block;

            /* 1F600..1F64F; Emoticons */
            block = uc_block (0x1F600);
            if (block)
              memcpy (&emoticon_blocks[emoticon_blocks_size++], block,
                      sizeof (uc_block_t));
            g_once_init_leave (&emoticon_blocks_initialized, 1);
          }
        gc_character_iter_init_for_blocks (iter,
                                           emoticon_blocks,
                                           emoticon_blocks_size);
        iter->filter = filter_is_print;
        return;
      }
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
    if (g_strstr_len (buffer, UNINAME_MAX, *keywords++) == NULL)
      return FALSE;

  return TRUE;
}

static void
gc_enumerate_character_by_keywords (GcCharacterIter      *iter,
                                    const gchar * const * keywords)
{
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
  gchar *buffer = g_new0 (gchar, UNINAME_MAX);
  return unicode_character_name (uc, buffer);
}

G_DEFINE_BOXED_TYPE (GcSearchResult, gc_search_result,
                     g_array_ref, g_array_unref);

gunichar
gc_search_result_get (GcSearchResult *result, gint index)
{
  g_return_val_if_fail (result, G_MAXUINT32);
  g_return_val_if_fail (0 <= index && index < result->len, G_MAXUINT32);

  return g_array_index (result, gunichar, index);
}

struct SearchData
{
  GcCategory category;
  gchar **keywords;
  const uc_script_t **scripts;
  gunichar uc;
  gint max_matches;
};

static void
search_data_free (struct SearchData *data)
{
  if (data->keywords)
    g_strfreev (data->keywords);
  if (data->scripts)
    g_free (data->scripts);
  g_slice_free (struct SearchData, data);
}

static void
gc_search_by_category_thread (GTask        *task,
                              gpointer      source_object,
                              gpointer      task_data,
                              GCancellable *cancellable)
{
  GcCharacterIter iter;
  GArray *result;
  struct SearchData *data = task_data;

  if (!all_blocks)
    uc_all_blocks (&all_blocks, &all_block_count);

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));
  gc_enumerate_character_by_category (&iter, data->category);
  while (!g_cancellable_is_cancelled (cancellable)
         && gc_character_iter_next (&iter))
    {
      gunichar uc = gc_character_iter_get (&iter);
      if (data->max_matches < 0 || result->len < data->max_matches)
        g_array_append_val (result, uc);
    }

  g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
}

/**
 * gc_search_by_category:
 * @category: a #GcCategory.
 * @max_matches: the maximum number of results.
 * @cancellable: a #GCancellable.
 * @callback: a #GAsyncReadyCallback.
 * @user_data: a user data passed to @callback.
 */
void
gc_search_by_category (GcCategory          category,
                       gint                max_matches,
                       GCancellable       *cancellable,
                       GAsyncReadyCallback callback,
                       gpointer            user_data)
{
  GTask *task;
  struct SearchData *data;

  task = g_task_new (NULL, cancellable, callback, user_data);

  data = g_slice_new0 (struct SearchData);
  data->category = category;
  data->max_matches = max_matches;
  g_task_set_task_data (task, data,
                        (GDestroyNotify) search_data_free);
  g_task_run_in_thread (task, gc_search_by_category_thread);
}

static void
gc_search_by_keywords_thread (GTask        *task,
                              gpointer      source_object,
                              gpointer      task_data,
                              GCancellable *cancellable)
{
  GcCharacterIter iter;
  GArray *result;
  struct SearchData *data = task_data;
  const gchar * const * keywords = (const gchar * const *) data->keywords;

  if (!all_blocks)
    uc_all_blocks (&all_blocks, &all_block_count);

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));
  gc_enumerate_character_by_keywords (&iter, keywords);
  while (!g_cancellable_is_cancelled (cancellable)
         && gc_character_iter_next (&iter))
    {
      gunichar uc = gc_character_iter_get (&iter);
      if (data->max_matches < 0 || result->len < data->max_matches)
        g_array_append_val (result, uc);
    }

  g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
}

/**
 * gc_search_by_keywords:
 * @keywords: (array zero-terminated=1) (element-type utf8): an array of keywords
 * @max_matches: the maximum number of results.
 * @cancellable: a #GCancellable.
 * @callback: a #GAsyncReadyCallback.
 * @user_data: a user data passed to @callback.
 */
void
gc_search_by_keywords (const gchar * const * keywords,
                       gint                  max_matches,
                       GCancellable         *cancellable,
                       GAsyncReadyCallback   callback,
                       gpointer              user_data)
{
  GTask *task;
  struct SearchData *data;

  task = g_task_new (NULL, cancellable, callback, user_data);

  data = g_slice_new0 (struct SearchData);
  data->keywords = g_strdupv ((gchar **) keywords);
  data->max_matches = max_matches;
  g_task_set_task_data (task, data,
                        (GDestroyNotify) search_data_free);
  g_task_run_in_thread (task, gc_search_by_keywords_thread);
}

static void
gc_search_by_scripts_thread (GTask        *task,
                             gpointer      source_object,
                             gpointer      task_data,
                             GCancellable *cancellable)
{
  GcCharacterIter iter;
  GArray *result;
  struct SearchData *data = task_data;

  if (!all_blocks)
    uc_all_blocks (&all_blocks, &all_block_count);

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));
  gc_character_iter_init_for_scripts (&iter,
                                      (const uc_script_t * const *) data->scripts);
  while (!g_cancellable_is_cancelled (cancellable)
         && gc_character_iter_next (&iter))
    {
      gunichar uc = gc_character_iter_get (&iter);
      g_array_append_val (result, uc);
    }

  g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
}

/**
 * gc_search_by_scripts:
 * @scripts: (array zero-terminated=1) (element-type utf8): an array of scripts
 * @max_matches: the maximum number of results.
 * @cancellable: a #GCancellable.
 * @callback: a #GAsyncReadyCallback.
 * @user_data: a user data passed to @callback.
 */
void
gc_search_by_scripts (const gchar * const * scripts,
                      gint                  max_matches,
                      GCancellable         *cancellable,
                      GAsyncReadyCallback   callback,
                      gpointer              user_data)
{
  GTask *task;
  struct SearchData *data;
  guint length, i;

  task = g_task_new (NULL, cancellable, callback, user_data);

  data = g_slice_new0 (struct SearchData);
  length = g_strv_length ((gchar **) scripts);
  data->scripts = g_malloc0_n (length + 1, sizeof (uc_script_t *));
  for (i = 0; i < length; i++)
    data->scripts[i] = uc_script_byname (scripts[i]);
  data->max_matches = max_matches;
  g_task_set_task_data (task, data,
                        (GDestroyNotify) search_data_free);
  g_task_run_in_thread (task, gc_search_by_scripts_thread);
}

static int
confusable_character_class_compare (const void *a,
                                    const void *b)
{
  const struct ConfusableCharacterClass *ac = a, *bc = b;
  return ac->uc == bc->uc ? 0 : (ac->uc < bc->uc ? -1 : 1);
}

static void
gc_add_confusables (struct SearchData *data,
                    GArray            *result,
                    GCancellable      *cancellable)
{
  struct ConfusableCharacterClass key, *res;

  key.uc = data->uc;
  res = bsearch (&key, confusable_character_classes,
                 G_N_ELEMENTS (confusable_character_classes),
                 sizeof (*confusable_character_classes),
                 confusable_character_class_compare);
  if (res)
    {
      const struct ConfusableClass *klass = &confusable_classes[res->index];
      uint16_t i;

      for (i = 0; i < klass->length
             && !g_cancellable_is_cancelled (cancellable); i++)
        {
          gunichar uc = confusable_characters[klass->offset + i];
          if (data->max_matches < 0 || result->len < data->max_matches)
            g_array_append_val (result, uc);
        }
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
add_composited (GArray *result,
                ucs4_t uc,
                ucs4_t *block_characters,
                size_t n_block_characters)
{
  ucs4_t decomposition[UC_DECOMPOSITION_MAX_LENGTH];
  int decomposition_length;
  ucs4_t base;
  size_t i;

  decomposition_length = uc_canonical_decomposition (uc, decomposition);
  if (decomposition_length > 0)
    {
      base = decomposition[0];
      g_array_append_val (result, base);
    }
  else
    base = uc;

  for (i = 0; i < n_block_characters; i++)
    {
      const uc_block_t *block;

      block = uc_block (block_characters[i]);
      for (uc = block->start; uc < block->end; uc++)
        {
          decomposition_length = uc_canonical_decomposition (uc, decomposition);
          if (decomposition_length > 0 && decomposition[0] == base)
            g_array_append_val (result, uc);
        }
    }
}

static void
gc_search_related_thread (GTask        *task,
                          gpointer      source_object,
                          gpointer      task_data,
                          GCancellable *cancellable)
{
  GArray *result;
  struct SearchData *data = task_data;
  ucs4_t mirror;
  gunichar uc;
  gint i;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));

  uc = uc_toupper (data->uc);
  g_array_append_val (result, uc);

  uc = uc_tolower (data->uc);
  g_array_append_val (result, uc);

  uc = uc_totitle (data->uc);
  g_array_append_val (result, uc);

  if (uc_mirror_char (data->uc, &mirror))
    {
      uc = mirror;
      g_array_append_val (result, uc);
    }

  if (uc_is_general_category (data->uc, UC_CATEGORY_L))
    {
      const uc_script_t *script;

      script = uc_script (data->uc);
      if (script)
        {
          if (strcmp (script->name, "Latin") == 0)
            {
              ucs4_t block_starters[4] = { 0x0000, 0x0080, 0x0100, 0x0180 };
              add_composited (result, data->uc,
                              block_starters, G_N_ELEMENTS (block_starters));
            }
          else if (strcmp (script->name, "Hiragana") == 0)
            {
              ucs4_t block_starters[1] = { 0x3040 };
              add_composited (result, data->uc,
                              block_starters, G_N_ELEMENTS (block_starters));
            }
          else if (strcmp (script->name, "Katakana") == 0)
            {
              ucs4_t block_starters[2] = { 0x30A0, 0x31F0 };
              add_composited (result, data->uc,
                              block_starters, G_N_ELEMENTS (block_starters));
            }
        }
    }

  gc_add_confusables (data, result, cancellable);
  g_array_sort (result, compare_unichar);
  remove_duplicates (result);

  for (i = 0; i < result->len; i++)
    {
      gunichar *puc;

      puc = &g_array_index (result, gunichar, i);
      if (*puc == data->uc)
        {
          g_array_remove_index (result, i);
          break;
        }
    }

  g_task_return_pointer (task, result, (GDestroyNotify) g_array_unref);
}

/**
 * gc_search_related:
 * @uc: a #gunichar.
 * @max_matches: the maximum number of results.
 * @cancellable: a #GCancellable.
 * @callback: a #GAsyncReadyCallback.
 * @user_data: a user data passed to @callback.
 */
void
gc_search_related (gunichar            uc,
                   gint                max_matches,
                   GCancellable       *cancellable,
                   GAsyncReadyCallback callback,
                   gpointer            user_data)
{
  GTask *task;
  struct SearchData *data;

  task = g_task_new (NULL, cancellable, callback, user_data);

  data = g_slice_new0 (struct SearchData);
  data->uc = uc;
  data->max_matches = max_matches;
  g_task_set_task_data (task, data,
                        (GDestroyNotify) search_data_free);
  g_task_run_in_thread (task, gc_search_related_thread);
}

/**
 * gc_search_finish:
 * @result: a #GAsyncResult.
 * @error: return location of an error.
 *
 * Returns: (transfer full): an array of characters.
 */
GcSearchResult *
gc_search_finish (GAsyncResult *result,
                  GError      **error)
{
  g_return_val_if_fail (g_task_is_valid (result, NULL), NULL);

  return g_task_propagate_pointer (G_TASK (result), error);
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

void
gc_pango_layout_set_font_features (PangoLayout *layout, gchar *features)
{
  PangoAttrList *attr_list;

  attr_list = pango_layout_get_attributes (layout);
  if (!attr_list)
    {
      attr_list = pango_attr_list_new ();
      pango_layout_set_attributes (layout, attr_list);
    }
  pango_attr_list_change (attr_list, pango_attr_font_features_new (features));
}

/**
 * gc_pango_list_font_features:
 * @font: a #PangoFont
 *
 * Returns: (transfer full) (nullable) (array zero-terminated=1): A
 *   list of OpenType feature tags.
 */
gchar **
gc_pango_list_font_features (PangoFont *font)
{
#ifdef HAVE_PANGOFT2
  if (PANGO_IS_FC_FONT (font))
    {
      FT_Face ftface = pango_fc_font_lock_face (PANGO_FC_FONT (font));
      hb_face_t *hbface = hb_ft_face_create_cached (ftface);
      unsigned int count, i;
      hb_tag_t *features;
      gchar buf[5];
      gchar **result;

      count = hb_ot_layout_table_get_feature_tags (hbface, HB_OT_TAG_GSUB, 0,
						   NULL, NULL);
      features = g_new (hb_tag_t, count + 1);
      hb_ot_layout_table_get_feature_tags (hbface, HB_OT_TAG_GSUB, 0,
					   &count, features);
      result = g_new0 (gchar *, count + 1);
      for (i = 0; i < count; i++)
	{
	  buf[4] = '\0';
	  hb_tag_to_string (features[i], buf);
	  result[i] = g_strdup (buf);
	}
      g_free (features);
      pango_fc_font_unlock_face (PANGO_FC_FONT (font));
      return result;
    }
#endif
  return NULL;
}

static void
collect_features (gpointer key,
		  gpointer value,
		  gpointer user_data)
{
  GArray *result = user_data;
  g_array_append_val (result, value);
}

/**
 * gc_pango_list_effective_font_features:
 * @font: a #PangoFont
 * @font_features: (array zero-terminated=1) (element-type utf8): a
 *   list of font features
 * @uc: a #gunichar
 *
 * Returns: (transfer full) (nullable) (array zero-terminated=1): A
 *   list of OpenType feature tags followed by a space and the index.
 */
gchar **
gc_pango_list_effective_font_features (PangoFont *font,
				       gchar **font_features,
				       gunichar uc)
{
  GHashTable *table = g_hash_table_new (g_direct_hash, g_direct_equal);
  GArray *result = g_array_sized_new (TRUE, FALSE,
				      sizeof (gchar *),
				      g_strv_length (font_features));

#ifdef HAVE_PANGOFT2
  if (PANGO_IS_FC_FONT (font))
    {
      FT_Face ftface = pango_fc_font_lock_face (PANGO_FC_FONT (font));
      hb_face_t *hbface = hb_ft_face_create_cached (ftface);
      hb_buffer_t *buffer;
      hb_font_t *hbfont = NULL;
      hb_glyph_info_t *infos;
      unsigned int length;
      hb_feature_t features[1];
      hb_codepoint_t base_gid = 0;
      gchar **p, *last;
      gint index;
      uint8_t utf8[6];
      size_t utf8_length = G_N_ELEMENTS (utf8);

      u32_to_u8 (&uc, 1, utf8, &utf8_length);

      hbfont = hb_font_create (hbface);
      hb_ft_font_set_funcs (hbfont);
      hb_font_set_scale (hbfont, 10, 10);

      buffer = hb_buffer_create ();
      hb_buffer_set_direction (buffer, HB_DIRECTION_LTR);
      hb_buffer_add_utf8 (buffer, (const char *) utf8, utf8_length, 0, 1);

      hb_shape (hbfont, buffer, NULL, 0);
      infos = hb_buffer_get_glyph_infos (buffer, &length);
      if (length > 0)
	base_gid = infos[0].codepoint;
      hb_buffer_destroy (buffer);

      last = NULL;
      index = 0;
      for (p = font_features; *p; p++)
	{
	  gchar *feature_string;
	  hb_codepoint_t gid = 0;

	  /* OpenType features which could produce alternative glyphs:
	     calt, cv00-99, jp04, jp78, jp83, jp90, salt, ss00-20 */
	  if (!(strlen (*p) == 4
		&& (strcmp (*p, "calt") == 0
		    || (strcmp (*p, "cv00") >= 0 && strcmp (*p, "cv99") <= 0)
		    || strcmp (*p, "jp78") == 0
		    || strcmp (*p, "jp83") == 0
		    || strcmp (*p, "jp90") == 0
		    || strcmp (*p, "jp04") == 0
		    || strcmp (*p, "salt") == 0
		    || (strcmp (*p, "ss00") >= 0 && strcmp (*p, "ss20") <= 0))))
	    continue;

	  if (last != NULL && strcmp (*p, last) == 0)
	    index++;
	  else
	    index = 0;
	  last = *p;

	  feature_string = g_strdup_printf ("%s %d", *p, index);

	  hb_feature_from_string (feature_string, 6, &features[0]);

	  buffer = hb_buffer_create ();
	  hb_buffer_set_direction (buffer, HB_DIRECTION_LTR);
	  hb_buffer_add_utf8 (buffer, (const char *) utf8, utf8_length, 0, 1);
	  hb_shape (hbfont, buffer, features, 1);
	  infos = hb_buffer_get_glyph_infos (buffer, &length);

	  if (length > 0)
	    gid = infos[0].codepoint;
	  hb_buffer_destroy (buffer);

	  if (gid != base_gid
	      && !g_hash_table_contains (table, GINT_TO_POINTER (gid)))
	    g_hash_table_insert (table, GINT_TO_POINTER (gid), feature_string);
	  else
	    g_free (feature_string);
	}

      hb_font_destroy (hbfont);
      pango_fc_font_unlock_face (PANGO_FC_FONT (font));
    }
#endif
  g_hash_table_foreach (table, collect_features, result);
  g_hash_table_unref (table);
  return (gchar **) g_array_free (result, FALSE);
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
