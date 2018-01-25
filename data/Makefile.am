# I chose to use recursive automake so I can use nobase_ and avoid
# 5 different directory declarations
SUBDIRS = icons

app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/org.gnome.Characters.data.gresource.xml)
org.gnome.Characters.data.gresource: org.gnome.Characters.data.gresource.xml $(app_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

service_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/org.gnome.Characters.BackgroundService.data.gresource.xml)
org.gnome.Characters.BackgroundService.data.gresource: org.gnome.Characters.BackgroundService.data.gresource.xml $(service_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

resourcedir = $(pkgdatadir)
resource_DATA = org.gnome.Characters.data.gresource org.gnome.Characters.BackgroundService.data.gresource

appsdir = $(datadir)/applications
apps_DATA = org.gnome.Characters.desktop

org.gnome.Characters.desktop: org.gnome.Characters.desktop.in
	$(AM_V_GEN) $(MSGFMT) --desktop --template $< -d $(top_srcdir)/po -o $@

gsettings_SCHEMAS = org.gnome.Characters.gschema.xml

@GSETTINGS_RULES@

appstream_XML = org.gnome.Characters.appdata.xml

@APPSTREAM_XML_RULES@

org.gnome.Characters.appdata.xml: org.gnome.Characters.appdata.xml.in
	$(AM_V_GEN) $(MSGFMT) --xml --template $< -d $(top_srcdir)/po -o $@

org.gnome.Characters.service: org.gnome.Characters.service.in
	$(AM_V_GEN) sed \
		-e "s|[@]PACKAGE_NAME@|org.gnome.Characters|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		-e "s|[@]pkglibdir@|$(pkglibdir)|g" \
		$< > $@

org.gnome.Characters.BackgroundService.service: org.gnome.Characters.BackgroundService.service.in
	$(AM_V_GEN) sed \
		-e "s|[@]PACKAGE_NAME@|org.gnome.Characters|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		-e "s|[@]pkglibdir@|$(pkglibdir)|g" \
		$< > $@

servicedir = $(datadir)/dbus-1/services
service_DATA = org.gnome.Characters.service org.gnome.Characters.BackgroundService.service

searchproviderdir = $(datadir)/gnome-shell/search-providers
dist_searchprovider_DATA = org.gnome.Characters.search-provider.ini

EXTRA_DIST = \
	org.gnome.Characters.desktop.in \
	org.gnome.Characters.service.in \
	org.gnome.Characters.BackgroundService.service.in \
	org.gnome.Characters.data.gresource.xml \
	org.gnome.Characters.BackgroundService.data.gresource.xml \
	$(gsettings_SCHEMAS) \
	org.gnome.Characters.appdata.xml.in \
	$(app_resource_files) \
	ShellSearchProvider2.xml \
	$(apps_DATA) \
	$(appstream_XML) \
	meson.build \
	$(NULL)

CLEANFILES = \
	org.gnome.Characters.service \
	org.gnome.Characters.BackgroundService.service \
	org.gnome.Characters.data.gresource \
	org.gnome.Characters.BackgroundService.data.gresource \
	org.gnome.Characters.appdata.xml \
	org.gnome.Characters.appdata.valid \
	*.valid \
	gschemas.compiled \
	$(NULL)

GITIGNOREFILES = \
	org.gnome.Characters.desktop \
	$(NULL)

# For uninstalled use
all-local:
	$(GLIB_COMPILE_SCHEMAS) $(builddir)

-include $(top_srcdir)/git.mk
