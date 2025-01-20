/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { EventEmitter, WebSocketReliableError } from '@ceeblue/web-utils';

/**
 *  IStreamData is an interface to get JSON data from a stream, parse it and fire the onData callback
 *  It can receive data from multiple tracks.
 */
export interface IStreamData extends EventEmitter {
    /**
     * Call when the stream is closed
     * @param error error description on an improper closure
     * @event
     */
    onClose(error?: WebSocketReliableError): void;

    /**
     * Call on every data reception
     * @param time timestamp of the data
     * @param track data track
     * @param data JS data object received
     * @event
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onData(time: number, track: number, data: any): void;

    /**
     * URL of connction
     */
    get url(): string;

    /**
     * The list of tracks currently receiving
     */
    get tracks(): Array<number>;

    /**
     * Set the data tracks to receive
     */
    set tracks(tracks: Array<number>);

    /**
     * True when connection is closed, in other words when onClose event is fired
     */
    get closed(): boolean;

    /**
     * Close the Stream Data connection
     */
    close(): void;
}
