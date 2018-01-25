NULL =

appdir = $(pkgdatadir)
nodist_app_SCRIPTS = org.gnome.Characters org.gnome.Characters.BackgroundService

app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/org.gnome.Characters.src.gresource.xml)
org.gnome.Characters.src.gresource: org.gnome.Characters.src.gresource.xml $(app_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

service_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/org.gnome.Characters.BackgroundService.src.gresource.xml)
org.gnome.Characters.BackgroundService.src.gresource: org.gnome.Characters.BackgroundService.src.gresource.xml $(service_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

resourcedir = $(pkgdatadir)
resource_DATA = org.gnome.Characters.src.gresource org.gnome.Characters.BackgroundService.src.gresource

org.gnome.Characters: org.gnome.Characters.in
	$(AM_V_GEN) sed \
		-e "s|[@]GJS@|$(GJS)|g" \
		-e "s|[@]PACKAGE_VERSION@|$(PACKAGE_VERSION)|g" \
		-e "s|[@]prefix@|$(prefix)|g" \
		-e "s|[@]libdir@|$(libdir)|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		$< > $@
	@chmod +x $@

org.gnome.Characters.BackgroundService: org.gnome.Characters.BackgroundService.in
	$(AM_V_GEN) sed \
		-e "s|[@]GJS@|$(GJS)|g" \
		-e "s|[@]PACKAGE_VERSION@|$(PACKAGE_VERSION)|g" \
		-e "s|[@]prefix@|$(prefix)|g" \
		-e "s|[@]libdir@|$(libdir)|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		$< > $@
	@chmod +x $@

EXTRA_DIST = \
	org.gnome.Characters.in \
	org.gnome.Characters.src.gresource.xml \
	org.gnome.Characters.BackgroundService.in \
	org.gnome.Characters.BackgroundService.src.gresource.xml \
	$(app_resource_files) \
	$(service_resource_files) \
	meson.build \
	$(NULL)

CLEANFILES = \
	org.gnome.Characters \
	org.gnome.Characters.src.gresource \
	org.gnome.Characters.BackgroundService \
	org.gnome.Characters.BackgroundService.src.gresource \
	$(NULL)

install-exec-hook:
	$(MKDIR_P) $(DESTDIR)$(bindir)
	ln -sf $(appdir)/org.gnome.Characters $(DESTDIR)$(bindir)/$(PACKAGE_TARNAME)
uninstall-hook:
	-rm -f $(DESTDIR)$(bindir)/$(PACKAGE_TARNAME)

-include $(top_srcdir)/git.mk
