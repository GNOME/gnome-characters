AC_PREREQ(2.63)
AC_INIT([org.gnome.Characters], [3.26.2],
        [https://bugzilla.gnome.org/enter_bug.cgi?product=gnome-characters],
        [gnome-characters])

AC_CONFIG_HEADERS([config.h])
AC_CONFIG_MACRO_DIRS([glm4 m4])

AM_INIT_AUTOMAKE([1.12 dist-xz no-dist-gzip foreign tar-ustar no-define serial-tests -Wno-portability])
# revert automake using PACKAGE_TARNAME instead of PACKAGE_NAME
AC_SUBST([PACKAGE], [$PACKAGE_NAME])

PACKAGE_DBUS_PATH=/`echo $PACKAGE_NAME | sed 's,\.,/,g'`
AC_SUBST([PACKAGE_DBUS_PATH], [$PACKAGE_DBUS_PATH])

m4_ifdef([AM_SILENT_RULES], [AM_SILENT_RULES([yes])])

GETTEXT_PACKAGE=$PACKAGE_NAME
AC_SUBST(GETTEXT_PACKAGE)
AC_DEFINE_UNQUOTED(GETTEXT_PACKAGE, "$GETTEXT_PACKAGE",
                   [The prefix for our gettext translation domains.])
AM_GNU_GETTEXT([external])
AM_GNU_GETTEXT_VERSION([0.19.8])

AC_PROG_CC
gl_EARLY
gl_INIT

AM_PROG_CC_C_O
LT_INIT([disable-static])

PKG_PROG_PKG_CONFIG([0.22])

APPSTREAM_XML
GLIB_GSETTINGS
GOBJECT_INTROSPECTION_REQUIRE([1.35.9])
GJS_MIN_VERSION=1.43.3
PKG_CHECK_MODULES([DEPS], [gdk-3.0
                           gdk-pixbuf-2.0
                           gio-2.0
                           glib-2.0
                           gobject-2.0
                           gtk+-3.0
                           gjs-1.0 >= $GJS_MIN_VERSION])

AC_PATH_PROG([GJS],[gjs])

AC_PATH_PROG([MSGUNIQ],[msguniq],[AC_MSG_ERROR([msguniq is required])])

AC_ARG_ENABLE(dogtail,
              [AS_HELP_STRING([--enable-dogtail],
                              [test using dogtail [default=yes]])],,
              enable_dogtail=yes)
AM_CONDITIONAL(ENABLE_DOGTAIL, test "$enable_dogtail" != no)
# coverage
AC_ARG_ENABLE([coverage],
              [AS_HELP_STRING([--enable-coverage],
                              [enable code coverage])],
              , [enable_coverage=no])
if test x$enable_coverage = xyes; then
    if test x$GCC != xyes; then
        AC_MSG_ERROR([GCC is required for --enable-coverage])
    fi

    AC_PATH_TOOL([LCOV], [lcov])
    AC_PATH_TOOL([GENHTML], [genhtml])

    if test x$LCOV = x || test x$GENHTML = x; then
        AC_MSG_ERROR([lcov and genhtml are required for --enable-coverage])
    fi

    # only enable these if we ever want code coverage for libgd
    # (which we don't)
    #CFLAGS="$CFLAGS -g -O0 --coverage"
    #CXXFLAGS="$CXXFLAGS -g -O0 --coverage"
    #LIBS="$LIBS -lgcov"
fi
AM_CONDITIONAL([ENABLE_COVERAGE], [test x$enable_coverage = xyes])

AM_PATH_GLIB_2_0

GLIB_TESTS

GLIB_COMPILE_RESOURCES=`$PKG_CONFIG --variable glib_compile_resources gio-2.0`
AC_SUBST(GLIB_COMPILE_RESOURCES)

PKG_CHECK_MODULES([LIBGC], [gio-2.0 gtk+-3.0 pango])

AC_ARG_ENABLE(pangoft2,
    AS_HELP_STRING([--disable-pangoft2], [disable pangoft2 support]),,
    enable_pangoft2=auto
)

AS_IF([test "$enable_pangoft2" = "yes"], [have_pangoft2=yes],
      [test "$enable_pangoft2" = "auto"], PKG_CHECK_EXISTS([pangoft2], [have_pangoft2=yes]))

AS_IF([test "$have_pangoft2" = "yes"], [
    PKG_CHECK_MODULES([PANGOFT2], [pangoft2])
    AC_DEFINE([HAVE_PANGOFT2],[1],[Define if you want to enable pangoft2 support])
])

AC_CONFIG_FILES([
  Makefile
  data/Makefile
  data/icons/Makefile
  gllib/Makefile
  lib/Makefile
  src/Makefile
  tests/Makefile
  po/Makefile.in
])
AC_OUTPUT
