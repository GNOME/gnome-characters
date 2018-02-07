project(
  'org.gnome.Characters', 'c',
  version: '3.26.2',
  license: 'BSD3',
  default_options: 'buildtype=debugoptimized',
  meson_version: '>= 0.42.0'
)

characters_name = meson.project_name()
characters_background_name = characters_name + '.BackgroundService'

characters_version = meson.project_version()

characters_prefix = get_option('prefix')
characters_bindir = join_paths(characters_prefix, get_option('bindir'))
characters_datadir = join_paths(characters_prefix, get_option('datadir'))
characters_libdir = join_paths(characters_prefix, get_option('libdir'))
characters_libexecdir = join_paths(characters_prefix, get_option('libexecdir'))

characters_pkgdatadir = join_paths(characters_datadir, characters_name)
characters_pkglibdir = join_paths(characters_libdir, characters_name)

characters_gir_version = '1.0'
characters_ns = 'Gc'

cc = meson.get_compiler('c')

# *** Check for dbus service dir ***
dbus_service_dir = get_option('dbus_service_dir')
if dbus_service_dir == ''
  dbus_dep = dependency('dbus-1', required: false)
  assert(dbus_dep.found(), 'dbus-1 required but not found, please provide a valid D-Bus service dir')
  dbus_service_dir = dbus_dep.get_pkgconfig_variable('session_bus_services_dir')
endif

libunistring_src = '''
  #include <uniconv.h>
  int main() {
      u8_strconv_from_locale((char*)0);
  };
'''

# FIXME: libunistring doesn't have pkgconfig support
assert(cc.links(libunistring_src, name: 'libunistring support', args: '-lunistring'), 'libunistring is required but not found')

# Just check that gjs-1.0 is present and recent enough
dependency('gjs-1.0', version: '>= 1.43.3')

libgc_deps = [
  dependency('gio-2.0'),
  dependency('gtk+-3.0'),
  dependency('pango'),
  declare_dependency(link_args: '-lunistring')
]

if get_option('pangoft2')
  libgc_deps += dependency('pangoft2')
endif

gnome = import('gnome')
i18n = import('i18n')

po_dir = join_paths(meson.source_root(), 'po')

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
  characters_datadir,
  characters_bindir
)
