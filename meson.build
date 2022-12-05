project(
  'gnome-characters', 'c',
  version: '43.1',
  license: ['BSD-3-Clause', 'GPL-2.0-or-later'],
  default_options: 'buildtype=debugoptimized',
  meson_version: '>= 0.59.0'
)

if get_option('profile') == 'development'
  profile = 'Devel'
  vcs_tag = run_command('git', 'rev-parse', '--short', 'HEAD').stdout().strip()
  if vcs_tag == ''
    version_suffix = '-devel'
  else
    version_suffix = '-@0@'.format (vcs_tag)
  endif
else
  profile = ''
  version_suffix = ''
endif
application_id = 'org.gnome.Characters@0@'.format(profile)
search_provider_path = '/org/gnome/Characters@0@/SearchProvider'.format(profile)

characters_version = meson.project_version()

characters_prefix = get_option('prefix')
characters_bindir = join_paths(characters_prefix, get_option('bindir'))
characters_datadir = join_paths(characters_prefix, get_option('datadir'))
characters_libdir = join_paths(characters_prefix, get_option('libdir'))
characters_libexecdir = join_paths(characters_prefix, get_option('libexecdir'))

characters_pkgdatadir = join_paths(characters_datadir, application_id)
characters_pkglibdir = join_paths(characters_libdir, application_id)

characters_gir_version = '1.0'
characters_ns = 'Gc'

cc = meson.get_compiler('c')

# *** Check for dbus service dir ***
dbus_service_dir = get_option('dbus_service_dir')
if dbus_service_dir == ''
  dbus_service_dir = join_paths(characters_datadir, 'dbus-1', 'services')
endif

# Just check that gjs-1.0 is present and recent enough
dependency('gjs-1.0', version: '>= 1.50')
dependency('gtk4', version: '>=4.6')
libhandy = dependency ('libadwaita-1', version: '>= 1.2.alpha')

libgc_deps = [
  dependency('gio-2.0'),
  dependency('pango'),
  libhandy,
]

if get_option('pangoft2')
  libgc_deps += dependency('pangoft2')
endif

gnome = import('gnome')
i18n = import('i18n')

po_dir = join_paths(meson.project_source_root(), 'po')

top_inc = include_directories('.')

subdir('po')
subdir('data')
# FIXME: local gnulib library is not built
#subdir('gllib')
subdir('lib')
subdir('src')

if get_option('installed_tests')
  subdir('tests')
endif

configure_file(
  output: 'config.h',
  configuration: configuration_data()
)

meson.add_install_script(
  'meson_post_install.py',
  characters_bindir,
  characters_pkgdatadir,
  application_id
)

gnome.post_install(
  gtk_update_icon_cache: true,
  glib_compile_schemas: true,
  update_desktop_database: true,
)
