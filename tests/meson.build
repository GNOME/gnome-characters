xvfb_run = find_program('xvfb-run', required: false)

installed_tests = get_option('installed_tests')
installed_tests_execdir = join_paths(characters_libexecdir, 'installed-tests', application_id)
installed_tests_metadir = join_paths(characters_datadir, 'installed-tests', application_id)
template = 'test.in'

add_test_setup('default',
  is_default: true,
  env: {
    'GI_TYPELIB_PATH': meson.project_build_root() / 'lib',
    'LD_LIBRARY_PATH': meson.project_build_root() / 'lib',
    'GJS_PATH': ':'.join([
        meson.project_source_root() / 'src',
        meson.project_build_root() / 'src',
     ]),
    'GSETTINGS_SCHEMA_DIR': meson.project_build_root() / 'data',
    'GSETTINGS_BACKEND': 'memory',
  },
  exe_wrapper: xvfb_run.found() ? [xvfb_run, '-a'] : [],
)

js_test_runner = configure_file(
  input: 'jsTestRunner.js.in',
  output: 'jsTestRunner.js',
  install: installed_tests,
  install_dir: installed_tests_execdir,
  configuration: {
    'pkgname': application_id,
    'prefix': characters_prefix,
    'libdir': characters_libdir,
  }
)

js_tests = [
  'Util',
]

foreach js_test: js_tests
  test_file = files('test@0@.js'.format(js_test))

  test(js_test,
    gjs_console,
    args: test_file,
    depends: [
      gc_gir,
      settings_schemas,
    ],
  )

  if installed_tests
    install_data(test_file,
      install_dir: installed_tests_execdir)

    configure_file(
      input: template,
      output: 'JS-' + js_test + '.test',
      configuration: {
        'exec': ' '.join([
          'env',
          'GSETTINGS_BACKEND=memory',
          'xvfb-run -a',
          gjs_console.full_path(),
          installed_tests_execdir / fs.name(js_test_runner),
          fs.stem(fs.name(test_file)),
        ]),
      },
      install: true,
      install_dir: installed_tests_metadir,
    )
  endif
endforeach

if not installed_tests
  subdir_done()
endif

# FIXME: fix smoke_test.py: it's still using python2 and not tested for long time
subdir_done()

tests = ['smoke_test.py']

tests_data = files('testutil.py')

install_data(
  tests + tests_data,
  install_dir: installed_tests_execdir
)

foreach test: tests
  tests_conf = configuration_data()
  tests_conf.set('exec', installed_tests_execdir / test)

  configure_file(
    input: template,
    output: test + '.test',
    configuration: tests_conf,
    install: true,
    install_dir: installed_tests_metadir
  )
endforeach
