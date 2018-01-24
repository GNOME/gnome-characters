installed_tests_execdir = join_paths(characters_libexecdir, 'installed-tests', characters_name)
installed_tests_metadir = join_paths(characters_datadir, 'installed-tests', characters_name)

tests = ['smoke_test.py']

tests_data = files('testutil.py')

install_data(
  tests + tests_data,
  install_dir: installed_tests_execdir
)

template = 'test.in'

foreach test: tests
  tests_conf = configuration_data()
  tests_conf.set('testdir', installed_tests_execdir)

  configure_file(
    input: template,
    output: test + '.test',
    configuration: tests_conf,
    install: true,
    install_dir: installed_tests_metadir
  )
endforeach
