script_conf = configuration_data()
script_conf.set('GJS', find_program('gjs').path())
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

configure_file(
    input: 'org.gnome.Characters.BackgroundService.in',
    output: application_id + '.BackgroundService',
    configuration: script_conf,
    install: true,
    install_dir: characters_pkgdatadir
)

common_resource_data = files(
  'util.js'
)

resource_data = common_resource_data + files(
  'characterDialog.js',
  'charactersView.js',
  'main.js',
  'sidebar.js',
  'sidebarRow.js',
  'window.js'
)

resource_data = common_resource_data + files(
  'searchProvider.js',
  'service.js'
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

gnome.compile_resources(
  application_id + '.BackgroundService.src',
  configure_file(
    input: 'org.gnome.Characters.BackgroundService.src.gresource.xml.in',
    output: '@BASENAME@',
    configuration: resources_conf
  ),
  gresource_bundle: true,
  dependencies: resource_data,
  install: true,
  install_dir: characters_pkgdatadir
)
