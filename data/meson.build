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
)

gnome.compile_resources(
    application_id + '.data',
    'org.gnome.Characters.data.gresource.xml',
    gresource_bundle: true,
    dependencies: resource_data,
    install: true,
    install_dir: characters_pkgdatadir
)

gnome.compile_resources(
    application_id + '.BackgroundService.data',
    'org.gnome.Characters.BackgroundService.data.gresource.xml',
    gresource_bundle: true,
    dependencies: files('ShellSearchProvider2.xml'),
    install: true,
    install_dir: characters_pkgdatadir
)

desktop_conf = configuration_data ()
desktop_conf.set('appid', application_id)
desktop_conf.set('bindir', characters_bindir)

i18n.merge_file(
  type: 'desktop',
  input: configure_file (
    input: 'org.gnome.Characters.desktop.in',
    output: '@BASENAME@',
    configuration: desktop_conf
  ),
  output: application_id + '.desktop',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'applications')
)

appdata_file = i18n.merge_file(
  input: 'org.gnome.Characters.appdata.xml.in',
  output: application_id + '.appdata.xml',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'metainfo')
)

appstream_util = find_program('appstream-util', required: false)
if appstream_util.found()
  test(
    'validate-appdata', appstream_util,
    args: [
      'validate-relax', '--nonet', appdata_file.full_path()
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

configure_file(
  input: 'org.gnome.Characters.BackgroundService.service.in',
  output: application_id + '.BackgroundService.service',
  configuration: service_conf,
  install: true,
  install_dir: dbus_service_dir
)

install_data(
  'org.gnome.Characters.gschema.xml',
  install_dir: join_paths(characters_datadir, 'glib-2.0', 'schemas')
)

search_provider_conf = configuration_data()
search_provider_conf.set('appid', application_id)

configure_file(
  input: 'org.gnome.Characters.search-provider.ini',
  output: application_id + '.search-provider.ini',
  configuration: search_provider_conf,
  install: true,
  install_dir: join_paths(characters_datadir, 'gnome-shell', 'search-providers')
)
