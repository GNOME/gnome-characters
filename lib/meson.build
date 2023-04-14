gc_h = 'gc.h'

sources = files('gc.c')

enum_types = 'gc-enumtypes'

gc_enums = gnome.mkenums(
  enum_types,
  sources: gc_h,
  c_template: enum_types + '.c.template',
  h_template: enum_types + '.h.template',
  identifier_prefix: characters_ns,
  symbol_prefix: characters_ns.to_lower()
)

cflags = [
  '-DG_LOG_DOMAIN="libgc"',
  '-DG_DISABLE_DEPRECATED',
  '-DPREFIX="@0@"'.format(characters_prefix),
  '-DLIBDIR="@0@"'.format(characters_libdir)
]

libgc = shared_library(
  characters_ns.to_lower(),
  sources: sources + gc_enums,
  include_directories: top_inc,
  dependencies: libgc_deps,
  c_args: cflags,
  install: true,
  install_dir: characters_pkglibdir
)

gc_gir = gnome.generate_gir(
  libgc,
  sources: sources + [gc_enums[0], gc_enums[1], gc_h],
  nsversion: characters_gir_version,
  namespace: characters_ns,
  identifier_prefix: characters_ns,
  symbol_prefix: characters_ns.to_lower(),
  header: gc_h,
  includes: ['Gio-2.0', 'Pango-1.0'],
  install: true,
  install_dir_gir: join_paths(characters_pkgdatadir, 'gir-' + characters_gir_version),
  install_dir_typelib: join_paths(characters_pkglibdir, 'girepository-' + characters_gir_version)
)
