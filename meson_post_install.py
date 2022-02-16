#!/usr/bin/env python3

import os
import subprocess
import sys

destdir = os.environ.get('DESTDIR', '')
datadir = sys.argv[1]
bindir = os.path.normpath(destdir + os.sep + sys.argv[2])
pkgdatadir = sys.argv[3]
application_id = sys.argv[4]

if not os.path.exists(bindir):
  os.makedirs(bindir)

src = os.path.join(pkgdatadir, application_id)
dest = os.path.join(bindir, 'gnome-characters')
subprocess.call(['ln', '-s', '-f', src, dest])

if not os.environ.get('DESTDIR'):
    print('Compiling gsettings schemas...')
    subprocess.call(['glib-compile-schemas', os.path.join(datadir, 'glib-2.0', 'schemas')])

    print('Updating icon cache...')
    subprocess.call(['gtk4-update-icon-cache', '-qtf', os.path.join(datadir, 'icons', 'hicolor')])

    print('Updating desktop database...')
    subprocess.call(['update-desktop-database', '-q', os.path.join(datadir, 'applications')])

