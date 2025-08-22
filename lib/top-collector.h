#pragma once

#include <glib.h>

G_BEGIN_DECLS

/**
 * SECTION: top-collector
 * @title: TopCollector
 * @short_description: Maintain a bounded, deduplicating, sorted collection of keys
 *
 * #TopCollector is a small utility for maintaining the "top N" keys according
 * to a user-supplied comparison function. It is useful when you are collecting
 * results from multiple sources, want to deduplicate them, and only keep the
 * best-scoring items.
 *
 * The collector:
 *
 * - Stores only keys (no values).
 * - Uses a #GCompareDataFunc to order keys, with a caller-supplied
 *   @user_data passed at insertion time.
 * - Deduplicates keys: if a key is inserted more than once, the new instance
 *   replaces the old one if it compares better.
 * - Maintains a maximum size, trimming the worst element when exceeded.
 * - Returns the final keys in sorted order.
 */

/**
 * TopCollector:
 *
 * An opaque struct representing a top-N collector.
 */
typedef struct _TopCollector TopCollector;

/**
 * top_collector_new:
 * @max_results: maximum number of keys to retain
 * @key_hash: hash function for keys (e.g. g_direct_hash, g_str_hash)
 * @key_equal: equality function for keys (e.g. g_direct_equal, g_str_equal)
 * @cmp: comparison function used to order keys
 * @key_free: (nullable): function to free keys when discarded, or %NULL
 *
 * Create a new #TopCollector.
 *
 * The collector will keep at most @max_results keys, ordered by @cmp. Keys are
 * deduplicated using @key_hash and @key_equal.
 *
 * Returns: (transfer full): a new #TopCollector
 */
TopCollector * top_collector_new(gsize            max_results,
                                 GHashFunc        key_hash,
                                 GEqualFunc       key_equal,
                                 GCompareDataFunc cmp,
                                 GDestroyNotify   key_free);

/**
 * top_collector_free:
 * @c: (transfer full): a #TopCollector
 *
 * Free a #TopCollector and any keys it owns.
 */
void top_collector_free(TopCollector *c);

/**
 * top_collector_add:
 * @c: a #TopCollector
 * @key: (transfer full): a key to insert
 * @user_data: (nullable): user data passed to @cmp
 *
 * Offer a key to the collector.
 *
 * If the key is not already present, it is inserted in sorted order. If the key
 * is already present, the new key is compared against the existing one using
 * @cmp and @user_data. If the new key is better (i.e. @cmp returns < 0), it
 * replaces the old one. Otherwise it is discarded.
 *
 * If the collector exceeds @max_results, the worst key is removed.
 */
void top_collector_add(TopCollector *c,
                       gpointer      key,
                       gpointer      user_data);

/**
 * top_collector_steal:
 * @c: a #TopCollector
 *
 * Steal the retained keys from the collector.
 *
 * The collector remains valid - now empty - and can be reused later. The
 * returned array contains the keys in sorted order, as defined by the
 * comparison function.
 *
 * Returns: (transfer full) (element-type gpointer): a #GPtrArray of keys
 */
GPtrArray * top_collector_steal(TopCollector *c);

/**
 * TOP_COLLECTOR_AUTOPTR:
 *
 * Convenience macro for g_autoptr() cleanup of #TopCollector.
 */
G_DEFINE_AUTOPTR_CLEANUP_FUNC (TopCollector, top_collector_free)

G_END_DECLS
