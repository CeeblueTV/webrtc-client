/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/**
 * Implement this interface to throw log and error
 */
export interface ILog {
    /**
     * Call to distribute log message, default implementation is usually `onLog(log:string) { console.log(log); }`
     * @param log log string message
     * @event
     */
    onLog(log: string): void;
    /**
     * Call to distribute error message, default implementation is usually `onError(error:string) { console.error(error); }`
     * @param error error string message
     * @event
     */
    onError(error: string): void;
}
