AM_CPPFLAGS =					\
        -I$(top_srcdir)				\
        -DPREFIX=\"$(prefix)\"			\
        -DLIBDIR=\"$(libdir)\"			\
        -DG_LOG_DOMAIN=\"libgc\"		\
        -DG_DISABLE_DEPRECATED			\
        $(LIBGC_CFLAGS)				\
        $(NULL)

pkglib_LTLIBRARIES = libgc.la

libgc_la_LIBADD = $(LIBGC_LIBS)
libgc_la_LDFLAGS = -avoid-version
libgc_la_SOURCES = gc.h gc.c

include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = Gc-1.0.gir

Gc-1.0.gir: libgc.la Makefile
Gc_1_0_gir_NAMESPACE = Gc
Gc_1_0_gir_VERSION = 1.0
Gc_1_0_gir_LIBS = libgc.la
Gc_1_0_gir_CFLAGS = $(AM_CPPFLAGS)
Gc_1_0_gir_SCANNERFLAGS =			\
       --warn-all				\
       --symbol-prefix=gc			\
       --identifier-prefix=Gc			\
        --c-include="gc.h"			\
       $(NULL)
Gc_1_0_gir_FILES = $(libgc_la_SOURCES)

girdir= $(pkgdatadir)/gir-1.0
typelibdir= $(pkglibdir)/girepository-1.0

gir_DATA = $(INTROSPECTION_GIRS)
typelib_DATA = $(gir_DATA:.gir=.typelib)

EXTRA_DIST = $(gir_DATA)
CLEANFILES = $(typelib_DATA)

-include $(top_srcdir)/git.mk
