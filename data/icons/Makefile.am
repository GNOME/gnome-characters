icondir = $(datadir)/icons

nobase_icon_DATA = \
	gnome/scalable/categories/characters-punctuation-symbolic.svg \
	gnome/scalable/categories/characters-arrow-symbolic.svg \
	gnome/scalable/categories/characters-bullet-symbolic.svg \
	gnome/scalable/categories/characters-picture-symbolic.svg \
	gnome/scalable/categories/characters-currency-symbolic.svg \
	gnome/scalable/categories/characters-math-symbolic.svg \
	gnome/scalable/categories/characters-latin-symbolic.svg
EXTRA_DIST = $(icon_DATA) characters-stencils.svg render-symbolic.rb

gtk_update_icon_cache = gtk-update-icon-cache -f -t $(datadir)/icons/gnome -t $(datadir)/icons/hicolor; gtk-update-icon-cache -f -t $(datadir)/icons/HighContrast

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
