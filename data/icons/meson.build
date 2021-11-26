icons_dir = join_paths(characters_datadir, 'icons')

scalable_path = join_paths('hicolor', 'scalable', 'apps')
symbolic_path = join_paths('hicolor', 'symbolic', 'apps')

install_data(
  join_paths(scalable_path, application_id + '.svg'),
  install_dir: join_paths(icons_dir, scalable_path)
)

install_data(
  join_paths(symbolic_path, 'org.gnome.Characters-symbolic.svg'),
  install_dir: join_paths(icons_dir, symbolic_path),
  rename: '@0@-symbolic.svg'.format(application_id)
)
