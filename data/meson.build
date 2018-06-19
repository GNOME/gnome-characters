subdir('icons')

resource_data = files(
  'icons/hicolor/scalable/categories/characters-arrow-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-bullet-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-currency-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-emoji-activities.svg',
  'icons/hicolor/scalable/categories/characters-emoji-animals.svg',
  'icons/hicolor/scalable/categories/characters-emoji-flags.svg',
  'icons/hicolor/scalable/categories/characters-emoji-food.svg',
  'icons/hicolor/scalable/categories/characters-emoji-objects.svg',
  'icons/hicolor/scalable/categories/characters-emoji-smileys.svg',
  'icons/hicolor/scalable/categories/characters-emoji-symbols.svg',
  'icons/hicolor/scalable/categories/characters-emoji-travel.svg',
  'icons/hicolor/scalable/categories/characters-latin-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-math-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-picture-symbolic.svg',
  'icons/hicolor/scalable/categories/characters-punctuation-symbolic.svg',
  'application.css',
  'app-menu.ui',
  'characterlist.ui',
  'character.ui',
  'mainview.ui',
  'mainwindow.ui',
  'menu.ui'
)

resources = [
  [characters_name, resource_data],
  [characters_background_name, files('ShellSearchProvider2.xml')]
]

foreach resource: resources
  name = resource[0] + '.data'

  gnome.compile_resources(
    name,
    name + '.gresource.xml',
    gresource_bundle: true,
    dependencies: resource[1],
    install: true,
    install_dir: characters_pkgdatadir
  )
endforeach

i18n.merge_file(
  'desktop-file',
  type: 'desktop',
  input: characters_name + '.desktop.in',
  output: characters_application_id + '.desktop',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'applications')
)

i18n.merge_file(
  'appdata-file',
  input: characters_name + '.appdata.xml.in',
  output: characters_application_id + 'appdata.xml',
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(characters_datadir, 'metainfo')
)

service_conf = configuration_data()
service_conf.set('appid', characters_application_id)
service_conf.set('PACKAGE_NAME', characters_name)
service_conf.set('pkgdatadir', characters_pkgdatadir)

configure_file(
  input: characters_name + '.service.in',
  output: characters_application_id + '.service',
  configuration: service_conf,
  install: true,
  install_dir: dbus_service_dir
)

configure_file(
  input: characters_background_name + '.service.in',
  output: characters_background_name + '.service',
  configuration: service_conf,
  install: true,
  install_dir: dbus_service_dir
)

install_data(
  characters_name + '.gschema.xml',
  install_dir: join_paths(characters_datadir, 'glib-2.0', 'schemas')
)

search_provider_conf = configuration_data()
search_provider_conf.set('appid', characters_application_id)

configure_file(
  input: characters_name + '.search-provider.ini',
  output: characters_name + '.search-provider.ini',
  configuration: search_provider_conf,
  install: true,
  install_dir: join_paths(characters_datadir, 'gnome-shell', 'search-providers')
)
