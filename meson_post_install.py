#!/usr/bin/env python3

import os
import subprocess
import sys

destdir = os.environ.get('DESTDIR', '')
bindir = os.path.normpath(destdir + os.sep + sys.argv[1])
pkgdatadir = sys.argv[2]
application_id = sys.argv[3]

if not os.path.exists(bindir):
  os.makedirs(bindir)

src = os.path.join(pkgdatadir, application_id)
dest = os.path.join(bindir, 'gnome-characters')
subprocess.call(['ln', '-s', '-f', src, dest])
