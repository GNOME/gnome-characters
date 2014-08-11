#ifndef __GC_H__
#define __GC_H__

#include <glib-object.h>

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

GType            gc_character_iter_get_type (void);

gboolean         gc_character_iter_next     (GcCharacterIter      *iter);
gunichar         gc_character_iter_get      (GcCharacterIter      *iter);

GcCharacterIter *gc_enumerate_character_by_category
                                            (GcCategory            category);

GcCharacterIter *gc_enumerate_character_by_keywords
                                            (const gchar * const * keywords);

const gchar     *gc_character_name          (gunichar              uc,
                                             gchar                *buffer);

G_END_DECLS

#endif	/* __GC_H__ */
