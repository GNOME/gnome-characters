#include <config.h>

#include "gc.h"

#include <stdlib.h>
#include <string.h>
#include <unicase.h>
#include <unictype.h>
#include <uniname.h>
#include <unistr.h>
#include "confusables.h"

static const uc_block_t *all_blocks;
static size_t all_block_count;

/* libunistring <= 0.9.4 doesn't have Emoticons block defined.  */
static const uc_block_t emoticon_block =
  {
    0x1F600,
    0x1F64F,
    "Emoticons"
  };

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

  const uc_script_t *script;
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
filter_script (GcCharacterIter *iter, ucs4_t uc)
{
  return uc_is_print (uc) && uc_is_script (uc, iter->script);
}

static void
gc_character_iter_init_for_script (GcCharacterIter   *iter,
                                   const uc_script_t *script)
{
  gc_character_iter_init (iter);
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_script;
  iter->script = script;
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
	static uc_block_t picture_blocks[2];
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
      gc_character_iter_init_for_script (iter, uc_script ('A'));
      return;

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

	    /* libunistring <= 0.9.4 doesn't have Emoticons block defined.  */
	    if (!block)
	      block = &emoticon_block;

	    memcpy (&emoticon_blocks[emoticon_blocks_size++], block,
		    sizeof (uc_block_t));
	    g_once_init_leave (&emoticon_blocks_initialized, 1);
	  }
	gc_character_iter_init_for_blocks (iter,
					   emoticon_blocks,
					   emoticon_blocks_size);
	/* libunistring <= 0.9.4 doesn't have Emoticons block defined
	   and we can't use uc_is_print() here.  */
	iter->filter = filter_all;
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

  /* Match against the character itself.  */
  if (*keywords)
    {
      uint8_t utf8[6];
      size_t length = G_N_ELEMENTS (utf8);

      u32_to_u8 (&uc, 1, utf8, &length);
      if (length == strlen (*keywords) && memcmp (*keywords, utf8, length) == 0)
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

/**
 * gc_character_category:
 * @uc: a UCS-4 character
 *
 * Returns: (nullable): character category name of @uc.
 */
const gchar *
gc_character_category (gunichar uc)
{
  uc_general_category_t category = uc_general_category (uc);
  return uc_general_category_long_name (category);
}

/**
 * gc_character_script:
 * @uc: a UCS-4 character
 *
 * Returns: (nullable): the name of script which @uc belongs to.
 */
const gchar *
gc_character_script (gunichar uc)
{
  const uc_script_t *script = uc_script (uc);
  return script->name;
}

/**
 * gc_character_group:
 * @uc: a UCS-4 character
 *
 * Returns: (nullable): the name of Unicode block which @uc belongs to.
 */
const gchar *
gc_character_block (gunichar uc)
{
  const uc_block_t *block = uc_block (uc);
  return block->name;
}

/**
 * gc_character_decomposition:
 * @uc: a UCS-4 character
 *
 * Returns: (transfer full): the canonical charactera decomposition
 * mapping of @uc.
 */
GcSearchResult *
gc_character_decomposition (gunichar uc)
{
  ucs4_t decomposition[UC_DECOMPOSITION_MAX_LENGTH];
  int retval, i;
  GArray *result;

  result = g_array_new (FALSE, FALSE, sizeof (gunichar));

  retval = uc_canonical_decomposition (uc, decomposition);
  if (retval > 0)
    {
      /* Don't use g_array_append_vals, since the size of ucs4_t may
	 differ from gunichar's.  */
      for (i = 0; i < retval; i++)
	g_array_append_val (result, decomposition[i]);
    }

  return result;
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
  gunichar uc;
  gint max_matches;
};

static void
search_data_free (struct SearchData *data)
{
  if (data->keywords)
    g_strfreev (data->keywords);
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
