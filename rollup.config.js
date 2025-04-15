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
import commonjs from '@rollup/plugin-commonjs';
import { dts } from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const input = 'index.ts';
const output = 'dist/webrtc-client';

export default args => {
    let version = process.env.version ?? process.env.npm_package_version;
    // Validate the version format
    if (typeof version === 'string') {
        // https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
        const versionRegex =
            /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
        if (!versionRegex.test(version)) {
            throw new Error(
                'The provided version string does not comply with the Semantic Versioning (SemVer) format required. Please refer to https://semver.org/ for more details on the SemVer specification.'
            );
        }
        console.info('Building version: ' + version);
    } else {
        throw new Error('Version is undefined or not a string.');
    }

    const basePlugins = [
        replace({
            __lib__version__: "'" + version + "'",
            preventAssignment: true
        }),
        eslint(),
        typescript(),
        commonjs()
    ];

    const configs = [
        // CommonJS build
        {
            input,
            output: {
                name: 'CeeblueWebRTCClient',
                format: 'cjs',
                compact: true,
                sourcemap: true,
                file: output + '.cjs.js'
            },
            plugins: basePlugins
        },
        // ES Module build
        {
            input,
            output: {
                name: 'CeeblueWebRTCClient',
                format: 'es',
                compact: true,
                sourcemap: true,
                file: output + '.es.js'
            },
            plugins: basePlugins
        },
        // Browser bundle (IIFE)
        {
            input,
            output: {
                name: 'CeeblueWebRTCClient',
                format: 'iife',
                compact: true,
                sourcemap: true,
                file: output + '.bundle.js'
            },
            plugins: [...basePlugins, nodeResolve()]
        },
        // Browser ES Module bundle
        {
            input,
            output: {
                name: 'CeeblueWebRTCClient',
                format: 'es',
                compact: true,
                sourcemap: true,
                file: output + '.bundle.es.js'
            },
            plugins: [...basePlugins, nodeResolve()]
        },
        // Minified browser bundle
        {
            input,
            output: {
                name: 'CeeblueWebRTCClient',
                format: 'iife',
                compact: true,
                sourcemap: true,
                file: output + '.bundle.min.js'
            },
            plugins: [...basePlugins, nodeResolve(), terser()]
        },
        // Type definitions
        {
            input,
            output: {
                compact: true,
                file: output + '.d.ts'
            },
            plugins: [dts()]
        }
    ];

    return configs;
};
