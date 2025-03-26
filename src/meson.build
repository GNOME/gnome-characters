script_conf = configuration_data()
script_conf.set('GJS', gjs_console.full_path())
script_conf.set('PACKAGE_VERSION', characters_version)
script_conf.set('appid', application_id)
script_conf.set('libdir', characters_libdir)
script_conf.set('prefix', characters_prefix)

configure_file(
    input: 'org.gnome.Characters.in',
    output: application_id,
    configuration: script_conf,
    install: true,
    install_dir: characters_pkgdatadir
)

install_symlink(
  'gnome-characters',
  install_dir: characters_bindir,
  pointing_to: characters_pkgdatadir / application_id,
)

resource_data = files(
  'characterDialog.js',
  'charactersView.js',
  'main.js',
  'sidebar.js',
  'sidebarItem.js',
  'window.js',
  'searchProvider.js',
  'util.js',
)

resources_conf = configuration_data()
resources_conf.set('profile', profile)

gnome.compile_resources(
  application_id + '.src',
  configure_file(
    input: 'org.gnome.Characters.src.gresource.xml.in',
    output: '@BASENAME@',
    configuration: resources_conf
  ),
  gresource_bundle: true,
  dependencies: resource_data,
  install: true,
  install_dir: characters_pkgdatadir
)
