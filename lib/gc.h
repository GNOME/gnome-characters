/* libgc is a wrapper library to fill the gaps between Gjs and
   libunistring, pango, GTK+.  */

#ifndef __GC_H__
#define __GC_H__

#include <gio/gio.h>
#include <gtk/gtk.h>
#include <pango/pango.h>

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

typedef struct GcCharacterIter GcCharacterIter;

/* Enumeration API: provides synchronous access to Unicode characters
   in the given criteria.  */

GType            gc_character_iter_get_type (void);

gboolean         gc_character_iter_next     (GcCharacterIter      *iter);
gunichar         gc_character_iter_get      (GcCharacterIter      *iter);

GcCharacterIter *gc_enumerate_character_by_category
                                            (GcCategory            category);

GcCharacterIter *gc_enumerate_character_by_keywords
                                            (const gchar * const * keywords);

gchar           *gc_character_name          (gunichar              uc);

/* Search API: provides asynchronous access to Unicode characters in
   the given criteria.  Currently it only supports keyword-based
   search, but it could be generalized to accept user-defined search
   criteria.  However, note that if we allow search criteria written
   in JS, it needs to be run in the main context thread.  */

typedef GArray GcSearchResult;
typedef gboolean (*GcSearchFunc) (gunichar uc, gpointer user_data);

GType            gc_search_result_get_type  (void);
gunichar         gc_search_result_get       (GcSearchResult       *result,
                                             gint                  index);

void             gc_search_character        (const gchar * const * keywords,
                                             gint                  max_matches,
                                             GCancellable         *cancellable,
                                             GAsyncReadyCallback   callback,
                                             gpointer              user_data);
GcSearchResult  *gc_search_character_finish (GAsyncResult         *result,
                                             GError              **error);

/* GTK+ support.  gtk_clipboard_get() takes an GdkAtom as the first
   argument, but GdkAtom is not accessible through GI.  */

GtkClipboard    *gc_gtk_clipboard_get       (void);

/* Pango support.  pango_attr_*() are not accessible through GI.  */

void             gc_pango_layout_disable_fallback
                                            (PangoLayout          *layout);

G_END_DECLS

#endif	/* __GC_H__ */
