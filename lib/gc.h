/* libgc is a wrapper library to fill the gaps between Gjs and
   libunistring, pango, GTK+.  */

#ifndef __GC_H__
#define __GC_H__

#include <gio/gio.h>
#include <gtk/gtk.h>
#include <pango/pango.h>
#include "gc-enumtypes.h"

G_BEGIN_DECLS

/* libunistring support.  In libunistring, the Unicode general
   categories are defined as global constant, which is not accessible
   through GI.  */

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

/* Provides asynchronous access to Unicode characters with the given
   criteria.  Note that it is not feasible to support user-defined
   search criteria written in JS, because the JS code needs to be run
   in the main thread.  */

typedef GArray GcSearchResult;
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
gunichar              gc_search_result_get  (GcSearchResult       *result,
                                             gint                  index);

GType                 gc_search_criteria_get_type
                                            (void);

GcSearchCriteria     *gc_search_criteria_new_category
                                            (GcCategory            category);

GcSearchCriteria     *gc_search_criteria_new_keywords
                                            (const gchar * const * keywords);

GcSearchCriteria     *gc_search_criteria_new_scripts
                                            (const gchar * const * scripts);

GcSearchCriteria     *gc_search_criteria_new_related
                                            (gunichar              uc);

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

gchar                *gc_character_name     (gunichar              uc);
gboolean              gc_character_is_invisible
                                            (gunichar              uc);
gint                  gc_character_width    (gunichar              uc);


/* GTK+ support.  gtk_clipboard_get() takes an GdkAtom as the first
   argument, but GdkAtom is not accessible through GI.  */

GtkClipboard         *gc_gtk_clipboard_get  (void);

/* Pango support.  PangoAttrFallback is not accessible from GI.  */
void                  gc_pango_layout_disable_fallback
                                            (PangoLayout          *layout);

gboolean              gc_pango_context_font_has_glyph
                                            (PangoContext         *context,
                                             PangoFont            *font,
                                             gunichar              uc);

gchar                *gc_get_current_language
                                            (void);
const gchar * const * gc_get_scripts_for_language
                                            (const gchar          *language);

G_END_DECLS

#endif  /* __GC_H__ */
