/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { WebSocketReliable, Connect, EventEmitter, Util, ILogger, NullLogger } from '@ceeblue/web-utils';
import { IStreamData } from './IStreamData';

/**
 * WSStreamData is the WebSocket implementation of IStreamData
 * @example
 * const streamData = new WSStreamData({endPoint, streamName});
 * streamData.tracks = [0, 1]; // subscribe to data tracks 0 and 1
 * streamData.onData = time, track, data => {
 *    console.log(`Data received on track ${track} at ${time} : ${Util.stringify(data)}`);
 * }
 */
export class WSStreamData extends EventEmitter implements IStreamData {
    /**
     * @override{@inheritDoc IStreamData.onClose}
     * @event
     */
    onClose() {
        this._logger.log('onClose');
    }

    /**
     * @override{@inheritDoc IStreamData.onData}
     * @event
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onData(time: number, track: number, data: any) {
        this._logger.log(`Data received on track ${track} at ${time} : ${Util.stringify(data)}`);
    }

    /**
     * @override{@inheritDoc IStreamData.url}
     */
    get url(): string {
        return this._url;
    }

    /**
     * @override{@inheritDoc IStreamData.tracks}
     */
    get tracks(): Array<number> {
        return [...this._tracks];
    }

    /**
     * @override{@inheritDoc IStreamData.tracks}
     */
    set tracks(tracks: Array<number>) {
        this._tracks = [...tracks];
        this._sendTracks();
    }

    /**
     * @override{@inheritDoc IStreamData.closed}
     */
    get closed(): boolean {
        return !this._ws || this._ws.closed;
    }

    /**
     * Sets a new underlying logger for this PrefixLogger instance.
     *
     * This method allows changing the logger to which the messages are delegated.
     *
     * @param {ILogger} logger - The new logger to which messages will be delegated.
     */
    set logger(value: ILogger) {
        this._logger = value;
    }

    private _ws: WebSocketReliable;
    private _tracks: Array<number>;
    private _url: string;
    protected _logger: ILogger;
    /**
     * Build the stream data instance, it only connects to the server when tracks are set.
     */
    constructor(connectParams: Connect.Params) {
        super();
        this._logger = new NullLogger();
        this._url = Connect.buildURL(Connect.Type.DATA, connectParams).toString();
        this._tracks = Array<number>();
        this._ws = new WebSocketReliable();
        this._ws.onOpen = () => this._sendTracks(); // On open sends tracks subscription!
        this._ws.onClose = (error?: string) => {
            if (error) {
                this._logger.error(error);
            }
            this.onClose();
        };
        this._ws.onMessage = (message: string) => {
            let json;
            try {
                json = JSON.parse(message);
            } catch (e) {
                return this._logger.error('Invalid signaling message, ' + Util.stringify(e));
            }
            if (json.error) {
                return this._logger.error(json.error);
            }
            if ('time' in json && 'track' in json && 'data' in json) {
                this.onData(json.track, json.time, json.data);
            } else if (json.type !== 'on_time') {
                console.debug('Internal JSON : ', Util.stringify(json));
            }
        };
    }

    /**
     * @override{@inheritDoc IStreamData.close}
     */
    close(error?: string) {
        this._ws.close(error);
    }

    private _sendTracks() {
        if (!this._tracks.length) {
            // Automatically close when tracks are empty
            this.close();
            return;
        }

        if (this._ws.closed) {
            // Automatically connect when tracks are set
            this._ws.open(this._url);
        } else if (this._ws.opened) {
            this._ws.send(JSON.stringify({ type: 'tracks', tracks: this._tracks.join(',') }));
        } // else wait opened to send tracks command (see onOpen event), allows to supports reconnection
    }
}
