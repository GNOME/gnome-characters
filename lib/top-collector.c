#include "top-collector.h"
#include "glib.h"

struct _TopCollector {
  GSequence *seq;            /* sorted sequence of keys */
  GHashTable *index;         /* key -> GSequenceIter* */
  gsize max_results;
  GCompareDataFunc cmp;      /* comparator (compares keys, uses user_data) */
  GDestroyNotify destroy_key;
};

TopCollector *
top_collector_new(gsize            max_results,
                  GHashFunc        key_hash,
                  GEqualFunc       key_equal,
                  GCompareDataFunc cmp,
                  GDestroyNotify   key_free)
{
  g_return_val_if_fail (max_results > 0, NULL);
  g_return_val_if_fail (cmp != NULL, NULL);

  TopCollector *c = g_new0 (TopCollector, 1);

  c->seq = g_sequence_new (NULL);
  c->index = g_hash_table_new (key_hash, key_equal);
  c->max_results = max_results;
  c->cmp = cmp;
  c->destroy_key = key_free;

  return c;
}

static void destroy_key(TopCollector *c,
                        gpointer      old_key)
{
  if (!c->destroy_key)
    return;

  c->destroy_key (old_key);
}

void
top_collector_free(TopCollector *c)
{
  if (!c)
    return;

  for (GSequenceIter *it = g_sequence_get_begin_iter (c->seq);
       !g_sequence_iter_is_end (it);
       it = g_sequence_iter_next (it))
    {
      destroy_key (c, g_sequence_get (it));
    }

  g_sequence_free (c->seq);
  g_hash_table_destroy (c->index);
  g_free (c);
}

void
top_collector_add(TopCollector *c,
                  gpointer      key,
                  gpointer      user_data)
{
  g_return_if_fail (c != NULL);

  GSequenceIter *old_iter = g_hash_table_lookup (c->index, key);
  if (old_iter)
    {
      gpointer old_key = g_sequence_get (old_iter);
      gint cmp_result = c->cmp (key, old_key, user_data);
      if (cmp_result <= 0)
        {
          /* New key is not better, discard */
          destroy_key (c, key);
          return;
        }

      /* Replace old */
      g_sequence_remove (old_iter);
      g_hash_table_remove (c->index, old_key);
      destroy_key (c, old_key);
    }

  /* Insert new */
  GSequenceIter *iter = g_sequence_insert_sorted (c->seq, key, c->cmp, user_data);
  g_hash_table_insert (c->index, key, iter);

  /* Trim if too long */
  if (g_sequence_get_length (c->seq) > c->max_results)
    {
      GSequenceIter *last = g_sequence_iter_prev (g_sequence_get_end_iter (c->seq));
      gpointer last_key = g_sequence_get (last);

      g_hash_table_remove (c->index, last_key);

      destroy_key (c, last_key);

      g_sequence_remove (last);
    }
}

GPtrArray *
top_collector_steal(TopCollector *c)
{
  g_return_val_if_fail (c != NULL, NULL);

  GPtrArray *result = g_ptr_array_new ();
  for (GSequenceIter *it = g_sequence_get_begin_iter (c->seq);
       !g_sequence_iter_is_end (it);
       it = g_sequence_iter_next (it))
    {
      g_ptr_array_add (result, g_sequence_get (it));
    }

  g_clear_pointer (&c->seq, g_sequence_free);
  c->seq = g_sequence_new (NULL);
  g_hash_table_remove_all (c->index);

  return result;
}
