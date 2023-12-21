# Characters

Characters is a simple utility application to find and insert unusual
characters.  It allows you to quickly find the character you are
looking for by searching for keywords.

## Helpful Links
 * [File a Bug in GitLab](https://gitlab.gnome.org/GNOME/gnome-characters/issues)
 * [Download a Release Tarball](https://download.gnome.org/sources/gnome-characters/)
 * [Browse source code in Git version control](https://gitlab.gnome.org/GNOME/gnome-characters)
 * [Learn more about Characters](https://apps.gnome.org/Characters/)

## Building

Characters is built using meson:
```sh
meson --prefix=/usr build
ninja -C build
sudo ninja -C build install
```

## License

Files from [gtk-js-app](https://github.com/gcampax/gtk-js-app) are
licensed under 3-clause BSD.  Other files are GPL 2.0 or later.
