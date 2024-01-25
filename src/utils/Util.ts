/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const _perf = performance; // to increase x10 now performance!
const __lib__version__ = '?'; // will be replaced on building by library version

/**
 * Some basic utility functions
 */
export const Util = {
    /**
     * Version of the library
     */
    VERSION: __lib__version__,

    /**
     * An empty lambda function, pratical to disable default behavior of function or events which are not expected to be null
     * @example
     * console.log = Util.EMPTY_FUNCTION; // disable logs without breaking calls
     */
    EMPTY_FUNCTION: () => {},

    /**
     * Efficient and high resolution timestamp in milliseconds elapsed since {@link Util.timeOrigin}
     */
    time(): number {
        return Math.floor(_perf.now());
    },

    /**
     * Time origin represents the time when the application has started
     */
    timeOrigin(): number {
        return Math.floor(_perf.now() + _perf.timeOrigin);
    },

    /**
     * Parse query and returns it in an easy-to-use Javascript object form
     * @param urlOrQueryOrSearch string, url, or searchParams containing query. If not set it uses `location.search` to determinate query.
     * @returns An javascript object containing each option
     */
    options(
        urlOrQueryOrSearch: URL | URLSearchParams | string | object | undefined = typeof location === 'undefined'
            ? undefined
            : location
    ): object {
        if (!urlOrQueryOrSearch) {
            return {};
        }
        try {
            const url: any = urlOrQueryOrSearch;
            urlOrQueryOrSearch = new URL(url).searchParams;
        } catch (e) {
            if (typeof urlOrQueryOrSearch == 'string') {
                if (urlOrQueryOrSearch.startsWith('?')) {
                    urlOrQueryOrSearch = urlOrQueryOrSearch.substring(1);
                }
                urlOrQueryOrSearch = new URLSearchParams(urlOrQueryOrSearch);
            }
        }
        // works same if urlOrQueryOrSearch is null, integer, or a already object etc...
        return Util.objectFrom(urlOrQueryOrSearch, { withType: true, noEmptyString: true });
    },

    /**
     * Returns an easy-to-use Javascript object something iterable, such as a Map, Set, or Array
     * @param value iterable input
     * @param params.withType `false`, if set it tries to cast string value to a JS number/boolean/undefined/null type.
     * @param params.noEmptyString `false`, if set it converts empty string value to a true boolean, usefull to allow a `if(result.key)` check for example
     * @returns An javascript object
     */
    objectFrom(value: any, params: { withType: boolean; noEmptyString: boolean }): object {
        params = Object.assign({ withType: false, noEmptyString: false }, params);
        const obj: any = {};
        if (!value) {
            return obj;
        }
        for (const [key, val] of this.objectEntries(value)) {
            value = val;
            if (params.withType && value != null && value.substring) {
                if (value) {
                    const number = Number(value);
                    if (isNaN(number)) {
                        switch (value.toLowerCase()) {
                            case 'true':
                                value = true;
                                break;
                            case 'false':
                                value = false;
                                break;
                            case 'null':
                                value = null;
                                break;
                            case 'undefined':
                                value = undefined;
                                break;
                        }
                    } else {
                        value = number;
                    }
                } else if (params.noEmptyString) {
                    // if empty string => TRUE to allow a if(options.key) check for example
                    value = true;
                }
            }
            if (obj[key]) {
                if (!Array.isArray(obj[key])) {
                    obj[key] = new Array(obj[key]);
                }
                obj[key].push(value);
            } else {
                obj[key] = value;
            }
        }
        return obj;
    },

    /**
     * Returns entries from something iterable, such as a Map, Set, or Array
     * @param value iterable input
     * @returns An javascript object
     */
    objectEntries(value: any): [string, any][] {
        if (value.entries) {
            return value.entries();
        }
        return Array.from({
            [Symbol.iterator]: function* () {
                for (const key in value) {
                    yield [key, value[key]];
                }
            }
        });
    },

    /**
     * Converts various data types, such as objects, strings, exceptions, errors,
     * or numbers, into a string representation. Since it offers a more comprehensive format,
     * this function is preferred to `JSON.stringify()`.
     * @param obj Any objects, strings, exceptions, errors, or number
     * @param params.space `''`, allows to configure space in the string representation
     * @param params.decimal `2`, allows to choose the number of decimal to display in the string representation
     * @param params.recursive `false`, allows to serialize recursively every object value,  beware if a value refers to a already parsed value an infinite loop will occur.
     * @returns the final string representation
     */
    stringify(obj: any, params: { space?: string; decimal?: number; recursive?: boolean } = {}): string {
        params = Object.assign({ space: ' ', decimal: 2, recursive: false }, params);
        if (!obj) {
            return String(obj);
        }
        const error = obj.error || obj.message;
        if (error) {
            // is a error!
            obj = error;
        }
        const decimal = Number(params.decimal) || 0;
        if (obj.toFixed) {
            return obj.toFixed(decimal);
        }
        if (obj.substring) {
            // is already a string
            return String(obj);
        }
        const space = params.space || '';
        let res = '{' + space.replace(/[^\S\r\n]+/, '');
        let first = true;
        for (const name in obj) {
            let value = obj[name];
            if (value) {
                if (value.call) {
                    // is a function
                    continue;
                }
                if (params.recursive && value === Object(value)) {
                    value = Util.stringify(value, params);
                }
            }
            if (first) {
                first = false;
            } else {
                res += ',' + space;
            }
            res += name + ':' + (value && value.toFixed ? value.toFixed(decimal) : value);
        }
        return (res += space.replace(/[^\S\r\n]+$/, '') + '}');
    }
};
Object.freeze(Util);
