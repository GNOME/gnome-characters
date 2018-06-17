setup:
	meson --prefix=/usr /tmp/gnome-characters-build
build:
	ninja -C /tmp/gnome-characters-build
run-new:
	$(MAKE) build
	$(MAKE) install
	$(MAKE) run
install:
	sudo cp /tmp/gnome-characters-build/src/* /usr/share/org.gnome.Characters/
run:
	/usr/share/org.gnome.Characters/org.gnome.Characters
help:
	@echo ''
	@echo 'You need to run setup before build and only run setup once.'
	@echo 'setup   - run once to setup build process in /tmp/gnome-characters-build'
	@echo 'build   - build with ninja in /tmp/gnome-characters-build directory'
	@echo 'install - install on your system for testing'
	@echo 'run     - run gnome-characters for testing'
	@echo 'run-new - build, install on your sytem and then run for testing'
	@echo ''
