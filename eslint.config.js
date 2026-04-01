import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import htmlPlugin from '@html-eslint/eslint-plugin';
import headersPlugin from 'eslint-plugin-headers';

export default [
    {
        ignores: ['dist/**', 'docs/**']
    },
    {
        files: ['eslint.config.js'],
        rules: {
            'headers/header-format': 'off'
        }
    },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        ignores: ['eslint.config.js'],
        languageOptions: {
            ecmaVersion: 11,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2015,
                Symbol: 'readonly'
            }
        },
        plugins: {
            headers: headersPlugin
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-warning-comments': ['error', { terms: ['todo'], location: 'start' }],
            'no-console': 0,
            curly: ['error'],
            'no-empty': [2, { allowEmptyCatch: true }],
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
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 11,
                allowImportExportEverywhere: true
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            ...tsPlugin.configs['flat/eslint-recommended'].rules,
            ...tsPlugin.configs['flat/recommended'][2].rules,
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
            '@typescript-eslint/no-unsafe-function-type': 'off'
        }
    },
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
            ...htmlPlugin.configs.recommended.rules,
            'headers/header-format': 'off',
            '@html-eslint/indent': ['error', 4]
        }
    }
];
