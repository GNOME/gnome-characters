#ifndef __GC_H__
#define __GC_H__

#include <gio/gio.h>

G_BEGIN_DECLS

typedef enum
{
  GC_CATEGORY_NONE,
  GC_CATEGORY_PUNCTUATION,
  GC_CATEGORY_ARROW,
  GC_CATEGORY_BULLET,
  GC_CATEGORY_PICTURE,
  GC_CATEGORY_CURRENCY,
  GC_CATEGORY_MATH,
  GC_CATEGORY_LATIN,
  GC_CATEGORY_EMOTICON
} GcCategory;

typedef struct GcCharacterIter GcCharacterIter;

/**
 * GcSearchResult:
 * @chars: (array zero-terminated=1) (element-type guint32): an array of #gunichar.
 * @nchars: length of @chars.
 */
struct GcSearchResult
{
  gunichar *chars;
  gsize nchars;
  gsize maxchars;
};

typedef struct GcSearchResult GcSearchResult;
typedef gboolean (*GcSearchFunc) (gunichar uc, gpointer user_data);

GType            gc_character_iter_get_type (void);

gboolean         gc_character_iter_next     (GcCharacterIter      *iter);
gunichar         gc_character_iter_get      (GcCharacterIter      *iter);

GcCharacterIter *gc_enumerate_character_by_category
                                            (GcCategory            category);

GcCharacterIter *gc_enumerate_character_by_keywords
                                            (const gchar * const * keywords);

gchar           *gc_character_name          (gunichar              uc);

GType            gc_search_result_get_type  (void);

void             gc_search_character        (const gchar * const * keywords,
                                             gint                  max_matches,
                                             GCancellable         *cancellable,
                                             GAsyncReadyCallback   callback,
                                             gpointer              user_data);
GcSearchResult  *gc_search_character_finish (GAsyncResult         *result,
                                             GError              **error);

G_END_DECLS

#endif	/* __GC_H__ */
