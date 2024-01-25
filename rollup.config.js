/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

// For an extensive guide to getting started with the rollup.js JavaScript bundler, visit:
// https://blog.openreplay.com/the-ultimate-guide-to-getting-started-with-the-rollup-js-javascript-bundler

import replace from '@rollup/plugin-replace';
import eslint from '@rollup/plugin-eslint';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { dts } from 'rollup-plugin-dts';

const input = 'index.ts';
const output = 'dist/webrtc-client';

export default args => {
    let target;
    let format = args.format;
    let version = process.env.version;
    // Determine the target and format based on provided arguments
    if (format) {
        if (format.toLowerCase().startsWith('es')) {
            target = format;
            format = 'es';
        } else {
            target = 'es5';
        }
    } else {
        format = 'es';
        target = 'es6';
    }
    // Validate version format (SemVer)
    const [semVer, major, minor, patch, prerelease, buildmetadata] =
        version.match(
            /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
        ) ?? [];
    if (semVer) {
        version = semVer;
        console.info('Major: ' + major);
        console.info('Minor: ' + minor);
        console.info('Patch: ' + patch);
        console.info('Prerelease: ' + prerelease);
        console.info('Buildmetadata: ' + buildmetadata);
        console.info('Using provided version: ' + version);
    } else {
        version = process.env.npm_package_version;
        console.warn('(!) Invalid version format provided, using package.json version: ' + version);
    }

    return [
        {
            // Transpile and bundle the code
            input,
            output: {
                name: process.env.npm_package_name,
                format, // iife, es, cjs, umd, amd, system
                compact: true,
                sourcemap: true,
                file: output + '.js'
            },
            plugins: [
                replace({
                    __lib__version__: "'" + version + "'",
                    preventAssignment: true
                }),
                eslint(),
                typescript({ target })
            ]
        },
        {
            // Minify the bundled code
            input: output + '.js',
            output: {
                compact: true,
                sourcemap: true,
                file: output + '.min.js'
            },
            plugins: [terser()],
            context: 'window' // Useful for ES5 builds, ensures 'this' refers to 'window' in a browser context
        },
        {
            // Generate type definitions
            input,
            output: {
                compact: true,
                file: output + '.d.ts'
            },
            plugins: [dts()]
        }
    ];
};
