subdir('icons')

resource_data = files(
  'icons/hicolor/scalable/categories/characters-arrow-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-bullet-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-currency-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-latin-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-math-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-picture-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-punctuation-symbolic.svg',
  'style.css',
  'character_dialog.ui',
  'shortcuts.ui',
  'sidebar.ui',
  'window.ui',
  'ShellSearchProvider2.xml'
)

gnome.compile_resources(
    application_id + '.data',
    'org.gnome.Characters.data.gresource.xml',
    gresource_bundle: true,
    dependencies: resource_data,
    install: true,
    install_dir: characters_pkgdatadir
)

desktop_conf = configuration_data ()
desktop_conf.set('appid', application_id)
desktop_conf.set('bindir', characters_bindir)

i18n.merge_file(
  type: 'desktop',
  input: configure_file (
    input: 'org.gnome.Characters.desktop.in.in',
    output: '@BASENAME@',
    configuration: desktop_conf
  ),
  output: application_id + '.desktop',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'applications')
)

metainfo_file = i18n.merge_file(
  input: configure_file (
    input: 'org.gnome.Characters.metainfo.xml.in.in',
    output: '@BASENAME@',
    configuration: desktop_conf
  ),
  output: application_id + '.metainfo.xml',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'metainfo')
)

appstreamcli = find_program('appstreamcli', required: false)
if appstreamcli.found()
  test(
    'validate-metainfo', appstreamcli,
    args: [
      'validate', '--no-net', '--explain', metainfo_file,
    ]
  )
endif

service_conf = configuration_data()
service_conf.set('appid', application_id)
service_conf.set('bindir', characters_bindir)
service_conf.set('pkgdatadir', characters_pkgdatadir)

configure_file(
  input: 'org.gnome.Characters.service.in',
  output: application_id + '.service',
  configuration: service_conf,
  install: true,
  install_dir: dbus_service_dir
)

gschema_file = 'org.gnome.Characters.gschema.xml'
install_data(
  gschema_file,
  install_dir: join_paths(characters_datadir, 'glib-2.0', 'schemas')
)

compile_schemas = find_program('glib-compile-schemas', required: false)
if compile_schemas.found()
  settings_schemas = custom_target('settings-schemas',
    command: [compile_schemas, '@CURRENT_SOURCE_DIR@', '--targetdir=@OUTDIR@'],
    input: gschema_file,
    output: 'gschemas.compiled',
  )
endif

search_provider_conf = configuration_data()
search_provider_conf.set('appid', application_id)
search_provider_conf.set('search_provider_path', search_provider_path)

configure_file(
  input: 'org.gnome.Characters.search-provider.ini',
  output: application_id + '.search-provider.ini',
  configuration: search_provider_conf,
  install: true,
  install_dir: join_paths(characters_datadir, 'gnome-shell', 'search-providers')
)
