// SPDX-FileCopyrightText: 2025 Florian Müllner <fmuellner@gnome.org>
// SPDX-License-Identifier: MIT OR LGPL-3.0-or-later

import { defineConfig } from '@eslint/config-helpers';
import gnome from 'eslint-config-gnome';

const charactersGlobals = {
    debug: 'readonly',
    info: 'readonly',
    warning: 'readonly',
    critical: 'readonly',
    error: 'readonly',
    pkg: 'readonly',
    _: 'readonly',
    C_: 'readonly',
    N_: 'readonly',
    ngettext: 'readonly',
};

export default defineConfig([
    gnome.configs.recommended,
    gnome.configs.jsdoc,
    {
        ignores: [
            '_build-*',
            'build',
            'clean',
            'data',
            '.flatpak-builder',
            'lib',
            'po',
            'tests',
        ],
    },
    {
        languageOptions: {
            globals: charactersGlobals,
        },
        rules: {
            camelcase: [
                'error',
                {
                    properties: 'never',
                    allow: ['^vfunc_', '^on_'],
                },
            ],
            'object-curly-spacing': ['error', 'always'],
            'prefer-arrow-callback': 'error',
        },
    },
]);
