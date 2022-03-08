/* libgc is a wrapper library to fill the gaps between Gjs and GLib.  */

#ifndef __GC_H__
#define __GC_H__

#include <gio/gio.h>
#include "gc-enumtypes.h"

G_BEGIN_DECLS

/**
 * GcCategory:
 */
typedef enum
{
  GC_CATEGORY_NONE,
  GC_CATEGORY_LETTER,
  GC_CATEGORY_LETTER_PUNCTUATION,
  GC_CATEGORY_LETTER_ARROW,
  GC_CATEGORY_LETTER_BULLET,
  GC_CATEGORY_LETTER_PICTURE,
  GC_CATEGORY_LETTER_CURRENCY,
  GC_CATEGORY_LETTER_MATH,
  GC_CATEGORY_LETTER_LATIN,
  GC_CATEGORY_EMOJI,
  GC_CATEGORY_EMOJI_SMILEYS,
  GC_CATEGORY_EMOJI_PEOPLE,
  GC_CATEGORY_EMOJI_ANIMALS,
  GC_CATEGORY_EMOJI_FOOD,
  GC_CATEGORY_EMOJI_ACTIVITIES,
  GC_CATEGORY_EMOJI_TRAVEL,
  GC_CATEGORY_EMOJI_OBJECTS,
  GC_CATEGORY_EMOJI_SYMBOLS,
  GC_CATEGORY_EMOJI_FLAGS,
} GcCategory;

/* Provides asynchronous access to Unicode characters with the given
   criteria.  Note that it is not feasible to support user-defined
   search criteria written in JS, because the JS code needs to be run
   in the main thread.  */

typedef GPtrArray GcSearchResult;
typedef gboolean (*GcSearchFunc) (gunichar uc, gpointer user_data);

#define GC_SEARCH_ERROR (gc_search_error_quark ())

typedef enum
  {
    GC_SEARCH_ERROR_FAILED,
    GC_SEARCH_ERROR_INVALID_STATE
  } GcSearchError;

typedef enum
{
  GC_SEARCH_FLAG_NONE = 0,
  GC_SEARCH_FLAG_WORD = 1 << 0
} GcSearchFlag;

#define GC_TYPE_SEARCH_CRITERIA (gc_search_criteria_get_type ())

typedef struct _GcSearchCriteria GcSearchCriteria;

#define GC_TYPE_SEARCH_CONTEXT (gc_search_context_get_type ())
G_DECLARE_FINAL_TYPE (GcSearchContext, gc_search_context,
                      GC, SEARCH_CONTEXT, GObject)

GType                 gc_search_result_get_type
                                            (void);
const char           *gc_search_result_get  (GcSearchResult       *result,
                                             gint                  index);

GType                 gc_search_criteria_get_type
                                            (void);

GcSearchCriteria     *gc_search_criteria_new_category
                                            (GcCategory            category);

GcSearchCriteria     *gc_search_criteria_new_keywords
                                            (const gchar * const * keywords);

GcSearchCriteria     *gc_search_criteria_new_scripts
                                            (const GUnicodeScript *scripts,
                                             size_t                n_scripts);

GcSearchCriteria     *gc_search_criteria_new_related
                                            (const gchar          *character);

GcSearchContext      *gc_search_context_new (GcSearchCriteria     *criteria,
                                             GcSearchFlag          flags);
void                  gc_search_context_search
                                            (GcSearchContext      *context,
                                             gint                  max_matches,
                                             GCancellable         *cancellable,
                                             GAsyncReadyCallback   callback,
                                             gpointer              user_data);
GcSearchResult       *gc_search_context_search_finish
                                            (GcSearchContext      *context,
                                             GAsyncResult         *result,
                                             GError              **error);
gboolean              gc_search_context_is_finished
                                            (GcSearchContext      *context);

gboolean              gc_character_is_composite
                                            (const gunichar       *chars,
                                             int                   n_chars);
gchar                *gc_character_name     (const gunichar       *chars,
                                             int                   n_chars);
gboolean              gc_character_is_invisible
                                            (const gunichar       *chars,
                                             int                   n_chars);

gchar                *gc_get_current_language
                                            (void);
GUnicodeScript       *gc_get_scripts_for_language
                                            (const gchar          *language,
                                             size_t               *n_scripts);

G_END_DECLS

#endif  /* __GC_H__ */
