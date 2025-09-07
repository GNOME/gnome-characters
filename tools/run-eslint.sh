#!/bin/sh
# SPDX-License-Identifier: MIT OR LGPL-3.0-or-later

set -e

if ! cd "$(dirname -- "$0")"; then
	echo "Failed to change directory"
	exit 1
fi

if [ ! -d node_modules ]; then
	npm clean-install
fi

npm run lint -- "$@"
