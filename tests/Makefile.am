include $(top_srcdir)/glib-tap.mk

dogtail_tests = \
	smoke_test.py

TESTS_ENVIRONMENT += LC_ALL=C GSETTINGS_BACKEND=memory

if ENABLE_DOGTAIL
dist_test_scripts = $(dogtail_tests)
dist_test_data = testutil.py

CLEANFILES += *.pyc

if ENABLE_COVERAGE
lcov:
	( cd $(abs_top_builddir) ; $(TESTS_ENVIRONMENT) $(GJS) --coverage-output=$(abs_builddir) \
	$(foreach source,$(wildcard $(abs_top_srcdir)/src/*.js),-C $(abs_top_srcdir)/src/$(notdir $(source))) \
	$(abs_top_builddir)/src/org.gnome.Characters --gapplication-service ) & \
	sleep 2 && TESTUTIL_DONT_START=1 $(MAKE) $(AM_MAKEFLAGS) check
	$(GENHTML) $(builddir)/coverage.lcov

clean-local:
	rm -rf $(builddir)/src

CLEANFILES += *.html *.png *.css coverage.lcov
GITIGNOREFILES = src/
endif

else
EXTRA_DIST += testutil.py $(dogtail_tests)
endif

EXTRA_DIST += meson.build test.in

-include $(top_srcdir)/git.mk
