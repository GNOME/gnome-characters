script_conf = configuration_data()
script_conf.set('GJS', find_program('gjs').path())
script_conf.set('PACKAGE_VERSION', characters_version)
script_conf.set('appid', characters_application_id)
script_conf.set('libdir', characters_libdir)
script_conf.set('prefix', characters_prefix)

scripts = [
  characters_name,
  characters_background_name
]

foreach script: scripts
  configure_file(
    input: script + '.in',
    output: '@BASENAME@',
    configuration: script_conf,
    install: true,
    install_dir: characters_pkgdatadir
  )
endforeach

common_resource_data = files(
  'util.js'
)

resource_data = common_resource_data + files(
  'characterDialog.js',
  'charactersView.js',
  'main.js',
  'menu.js',
  'sidebar.js',
  'sidebarRow.js',
  'window.js'
)
resources = [[characters_name, resource_data]]

resource_data = common_resource_data + files(
  'searchProvider.js',
  'service.js'
)
resources += [[characters_background_name, resource_data]]

foreach resource: resources
  name = resource[0] + '.src'

  gnome.compile_resources(
    name,
    name + '.gresource.xml',
    gresource_bundle: true,
    dependencies: resource[1],
    install: true,
    install_dir: characters_pkgdatadir
  )
endforeach
