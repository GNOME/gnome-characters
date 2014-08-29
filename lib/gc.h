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

/* Provides asynchronous access to Unicode characters in the given
   criteria.  It could support user-defined search criteria written in
   JS, but it would need to be run in the main thread.  */

typedef GArray GcSearchResult;
typedef gboolean (*GcSearchFunc) (gunichar uc, gpointer user_data);

GType           gc_search_result_get_type (void);
gunichar        gc_search_result_get      (GcSearchResult       *result,
                                           gint                  index);

void            gc_search_by_category     (GcCategory            category,
                                           gint                  max_matches,
                                           GCancellable         *cancellable,
                                           GAsyncReadyCallback   callback,
                                           gpointer              user_data);
void            gc_search_by_keywords     (const gchar * const * keywords,
                                           gint                  max_matches,
                                           GCancellable         *cancellable,
                                           GAsyncReadyCallback   callback,
                                           gpointer              user_data);
GcSearchResult *gc_search_finish          (GAsyncResult         *result,
                                           GError              **error);

gchar          *gc_character_name         (gunichar              uc);

/* GTK+ support.  gtk_clipboard_get() takes an GdkAtom as the first
   argument, but GdkAtom is not accessible through GI.  */

GtkClipboard   *gc_gtk_clipboard_get      (void);

G_END_DECLS

#endif	/* __GC_H__ */
