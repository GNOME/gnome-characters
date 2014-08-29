#include "gc.h"

#include <string.h>
#include <unictype.h>
#include <uniname.h>
#include <unistr.h>

static const uc_block_t *all_blocks;
static size_t all_block_count;

typedef struct GcCharacterIter GcCharacterIter;

struct GcCharacterIter
{
  ucs4_t uc;

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

gboolean
gc_character_iter_next (GcCharacterIter *iter)
{
  ucs4_t uc = iter->uc;

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

gunichar
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
      /* Not implemented.  */
      break;

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
	    if (block)
	      memcpy (&emoticon_blocks[emoticon_blocks_size++], block,
		      sizeof (uc_block_t));
	    g_once_init_leave (&emoticon_blocks_initialized, 1);
	  }
	gc_character_iter_init_for_blocks (iter,
					   emoticon_blocks,
					   emoticon_blocks_size);
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

void
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
