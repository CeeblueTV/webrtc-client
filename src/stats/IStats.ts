/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { ILog } from '../utils/ILog';
import { EventEmitter } from '../utils/EventEmitter';

/**
 * IStats is the interface used to implement statistics seralization
 * The serialized object can then be sent to a server for analysis with {@link Telemetry}.
 * @example
 * // MyStats implementation
 * class MyStats extends IStats {
 *    constructor(obj) {
 *       this._obj = obj;
 *       // Subscribe to onClose event to signal object release (will stop this stats report)
 *       obj.onClose = () => this.onRelease();
 *    }
 *    async serialize() {
 *       // serialize stats to a JSON object {recvBytes, sendBytes}
 *       return {
 *          recvBytes: this._obj.recvBytes,
 *          sendBytes: this._obj.sendBytes
 *       }
 *    }
 * }
 */
export interface IStats extends ILog, EventEmitter {
    /**
     * Must be called when the resource is closed
     * @event
     */
    onRelease(): void;
    /**
     * Implements this function to define how to serialize data.
     * The function must return the metrics object or reject the Promise if the serialization is not possible.
     * @returns an async string for a text/plain response, an object for a JSON response, or ArrayBuffer for a binary response
     */
    serialize(): Promise<string | object | ArrayBuffer>;
}
