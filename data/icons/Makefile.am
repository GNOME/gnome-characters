icondir = $(datadir)/icons

nobase_icon_DATA = \
	hicolor/16x16/apps/gnome-characters.png \
	hicolor/22x22/apps/gnome-characters.png \
	hicolor/32x32/apps/gnome-characters.png \
	hicolor/48x48/apps/gnome-characters.png \
	hicolor/256x256/apps/gnome-characters.png \
	hicolor/symbolic/apps/gnome-characters-symbolic.svg

EXTRA_DIST = $(nobase_icon_DATA) hicolor/gnome-characters.svg \
	characters-stencils.svg render-icons.rb meson.build

gtk_update_icon_cache = gtk-update-icon-cache -f -t $(datadir)/icons/hicolor

install-data-hook: update-icon-cache
uninstall-hook: update-icon-cache
update-icon-cache:
	@-if test -z "$(DESTDIR)"; then \
		echo "Updating Gtk icon cache."; \
		$(gtk_update_icon_cache); \
	else \
		echo "*** Icon cache not updated.  After (un)install, run this:"; \
		echo "***   $(gtk_update_icon_cache)"; \
	fi

-include $(top_srcdir)/git.mk
