xvfb_run = find_program('xvfb-run', required: false)

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

js_tests = [
  'Util',
]

foreach js_test: js_tests
  test(js_test,
    gjs_console,
    args: files('test@0@.js'.format(js_test)),
    depends: [
      gc_gir,
      settings_schemas,
    ],
  )
endforeach

if not get_option('installed_tests')
  subdir_done()
endif

tests = ['smoke_test.py']

tests_data = files('testutil.py')

install_data(
  tests + tests_data,
  install_dir: installed_tests_execdir
)

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
