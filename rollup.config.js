/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

// For an extensive guide to getting started with the rollup.js JavaScript bundler, visit:
// https://blog.openreplay.com/the-ultimate-guide-to-getting-started-with-the-rollup-js-javascript-bundler

import replacer from '@rollup/plugin-replace';
import eslint from '@rollup/plugin-eslint';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import { dts } from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import autoExternal from 'rollup-plugin-auto-external';

const input = 'index.ts';
const output = 'dist/webrtc-client';
const name = 'CeeblueWebRTCClient';

export default args => {
    // Determine the package version by using the 'version' environment variable (for CI/CD processes) or fallback to the version specified in the 'package.json' file.
    const version = process.env.version ?? process.env.npm_package_version;
    // Validate the version format
    if (typeof version !== 'string') {
        throw new Error('Version is undefined or not a string.');
    }
    // https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
    const versionRegex =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    if (!versionRegex.test(version)) {
        throw new Error(
            'The provided version string does not comply with the Semantic Versioning (SemVer) format required. Please refer to https://semver.org/ for more details on the SemVer specification.'
        );
    }
    if (!args.target) {
        // ES6 by default
        args.target = 'es6';
    }
    console.info(`Building${args.format ? ' ' + args.format : ''} in ${args.target} version ${version}`);

    const ts = typescript({ target: args.target });
    delete args.target; // remove the target argument because it not valid for rollup
    const replace = replacer({
        __lib__version__: "'" + version + "'",
        preventAssignment: true
    });

    function createOutput(input, outputName, ...plugins) {
        return {
            input,
            output: [
                {
                    // normal
                    name,
                    format: args.format, // iife, es, cjs, umd, amd, system
                    compact: true,
                    sourcemap: true,
                    file: outputName + '.js'
                },
                {
                    // minified
                    name,
                    format: args.format, // iife, es, cjs, umd, amd, system
                    compact: true,
                    sourcemap: true,
                    plugins: [terser()],
                    file: outputName + '.min.js'
                }
            ],
            plugins
        };
    }

    return [
        // Generate type definitions
        {
            input,
            output: {
                compact: true,
                file: output + '.d.ts'
            },
            plugins: [dts()]
        },
        // NPM binaries
        createOutput(input, output, replace, eslint(), ts, commonjs(), autoExternal()),
        // Browser binaries
        createOutput(input, output + '.bundle', replace, eslint(), ts, commonjs(), nodeResolve())
    ];
};
