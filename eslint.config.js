import js from '@eslint/js';
import globals from 'globals';

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

import htmlParser from '@html-eslint/parser';
import htmlPlugin from '@html-eslint/eslint-plugin';

import headersPlugin from 'eslint-plugin-headers';

export default [
    // Replaces .eslintignore
    {
        ignores: ['dist/**', 'docs/**', 'eslint.config.js']
    },

    // Equivalent of "eslint:recommended"
    js.configs.recommended,

    // Base config for JS/TS files
    {
        files: ['**/*.{js,cjs,mjs,ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 11,
                allowImportExportEverywhere: true
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es6,
                Symbol: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            headers: headersPlugin
        },
        rules: {
            'no-warning-comments': ['error', { terms: ['todo'], location: 'start' }],
            'no-console': 0,
            curly: ['error'],
            'no-empty': [2, { allowEmptyCatch: true }],
            'no-unused-vars': 'off',
            'no-undef': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
            'no-useless-escape': 0,
            eqeqeq: ['error', 'smart'],
            'headers/header-format': [
                'error',
                {
                    source: 'file',
                    path: '.eslint-header'
                }
            ]
        }
    },

    // HTML override
    {
        files: ['**/*.html'],
        languageOptions: {
            parser: htmlParser
        },
        plugins: {
            '@html-eslint': htmlPlugin,
            headers: headersPlugin
        },
        rules: {
            'headers/header-format': 'off',
            '@html-eslint/indent': ['error', 4]
        }
    }
];
