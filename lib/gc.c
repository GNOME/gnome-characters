#include "gc.h"

#include <string.h>
#include <unictype.h>
#include <uniname.h>

static const uc_block_t *all_blocks;
static size_t all_block_count;

struct GcCharacterIter
{
  ucs4_t uc;

  const uc_block_t *blocks;
  size_t block_index;
  size_t block_count;

  gboolean (* filter) (ucs4_t uc, gpointer data);
  GBoxedFreeFunc free_data;
  GBoxedCopyFunc copy_data;
  gpointer data;
};

/**
 * gc_character_iter_copy:
 * @boxed: a #GcCharacterIter.
 *
 * Returns: (transfer full): a new #GcCharacterIter.
 */
static GcCharacterIter *
gc_character_iter_copy (GcCharacterIter *src)
{
  GcCharacterIter *dest = g_slice_dup (GcCharacterIter, src);
  if (src->data && src->copy_data)
    dest->data = src->copy_data (src->data);
  return dest;
}

static void
gc_character_iter_free (GcCharacterIter *iter)
{
  if (iter->data && iter->free_data)
    iter->free_data (iter->data);

  g_slice_free (GcCharacterIter, iter);
}

G_DEFINE_BOXED_TYPE (GcCharacterIter, gc_character_iter,
		     gc_character_iter_copy,
		     gc_character_iter_free);

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
	     && !iter->filter (uc, iter->data))
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

static GcCharacterIter *
gc_character_iter_new (void)
{
  GcCharacterIter *iter = g_slice_new0 (GcCharacterIter);
  iter->uc = UNINAME_INVALID;
  return iter;
}

static gboolean
filter_category (ucs4_t uc, gpointer data)
{
  uc_general_category_t *category = data;
  return uc_is_print (uc) && uc_is_general_category (uc, *category);
}

static gpointer
copy_category (gpointer data)
{
  return g_slice_dup (uc_general_category_t, data);
}

static void
free_category (gpointer data)
{
  g_slice_free (uc_general_category_t, data);
}

static GcCharacterIter *
gc_character_iter_new_for_general_category (uc_general_category_t category)
{
  GcCharacterIter *iter = gc_character_iter_new ();
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_category;
  iter->copy_data = copy_category;
  iter->free_data = free_category;
  iter->data = g_slice_dup (uc_general_category_t, &category);
  return iter;
}

static gboolean
filter_is_print (ucs4_t uc, gpointer data)
{
  return uc_is_print (uc);
}

static GcCharacterIter *
gc_character_iter_new_for_blocks (const uc_block_t *blocks,
                                  size_t            block_count)
{
  GcCharacterIter *iter = gc_character_iter_new ();
  iter->blocks = blocks;
  iter->block_count = block_count;
  iter->filter = filter_is_print;
  return iter;
}

static gboolean
filter_script (ucs4_t uc, gpointer data)
{
  uc_script_t *script = data;
  return uc_is_print (uc) && uc_is_script (uc, script);
}

static GcCharacterIter *
gc_character_iter_new_for_script (const uc_script_t *script)
{
  GcCharacterIter *iter = gc_character_iter_new ();
  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_script;
  iter->data = (gpointer) script;
  return iter;
}

/**
 * gc_enumerate_character_by_category:
 * @category: a #GcCategory.
 *
 * Returns: a #GcCharacterIter.
 */
GcCharacterIter *
gc_enumerate_character_by_category (GcCategory       category)
{
  if (!all_blocks)
    uc_all_blocks (&all_blocks, &all_block_count);

  switch (category)
    {
    case GC_CATEGORY_NONE:
      break;

    case GC_CATEGORY_PUNCTUATION:
      return gc_character_iter_new_for_general_category (UC_CATEGORY_P);

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
	return gc_character_iter_new_for_blocks (arrow_blocks,
						 arrow_blocks_size);
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
	return gc_character_iter_new_for_blocks (picture_blocks,
						 picture_blocks_size);
      }
      break;

    case GC_CATEGORY_CURRENCY:
      return gc_character_iter_new_for_general_category (UC_CATEGORY_Sc);

    case GC_CATEGORY_MATH:
      return gc_character_iter_new_for_general_category (UC_CATEGORY_Sm);

    case GC_CATEGORY_LATIN:
      return gc_character_iter_new_for_script (uc_script ('A'));

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
	return gc_character_iter_new_for_blocks (emoticon_blocks,
						 emoticon_blocks_size);
      }
    }

  return gc_character_iter_new ();
}

static gboolean
filter_keywords (ucs4_t uc, gpointer data)
{
  const gchar * const * keywords = data;
  gchar buffer[UNINAME_MAX];

  if (!unicode_character_name (uc, buffer))
    return FALSE;

  if (!uc_is_print (uc))
    return FALSE;

  while (keywords)
    if (g_strstr_len (buffer, UNINAME_MAX, *keywords++) == NULL)
      return FALSE;

  return TRUE;
}

GcCharacterIter *
gc_enumerate_character_by_keywords (const gchar * const * keywords)
{
  GcCharacterIter *iter = gc_character_iter_new ();
  gchar **keywords_upper = g_strdupv ((gchar **) keywords), **p;

  for (p = keywords_upper; *p != NULL; p++)
    {
      gchar *upper = g_ascii_strup (*p, strlen (*p));
      g_free (*p);
      *p = upper;
    }

  iter->blocks = all_blocks;
  iter->block_count = all_block_count;
  iter->filter = filter_keywords;
  iter->copy_data = (GBoxedCopyFunc) g_strdupv;
  iter->free_data = (GBoxedFreeFunc) g_strfreev;
  iter->data = keywords_upper;

  return iter;
}

const gchar *
gc_character_name (gunichar uc,
                   gchar   *buffer)
{
  return unicode_character_name (uc, buffer);
}
