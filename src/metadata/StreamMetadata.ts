/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { WebSocketReliable, Connect, EventEmitter, Util } from '@ceeblue/web-utils';
import { MTrack, MType, Metadata } from './Metadata';

const sortByMAXBPS = (track1: MTrack, track2: MTrack) => track2.maxbps - track1.maxbps;

/**
 * Use StreamMetadata to get real-time information on a server stream, including:
 *  - the list of tracks and their properties,
 *  - the list of availables sources and their properties,
 * @example
 * const streamMetadata = new StreamMetadata(Util.metadataURL(host, streamName));
 * streamMetadata.onMetadata = metadata => {
 *    console.log(metadata);
 * }
 */
export class StreamMetadata extends EventEmitter {
    /**
     * @override{@inheritDoc ILog.onLog}
     * @event
     */
    onLog(log: string) {}

    /**
     * @override{@inheritDoc ILog.onError}
     * @event
     */
    onError(error: string = 'unknown') {
        console.error(error);
    }

    /**
     * Event fired when the stream is closed
     * @event
     */
    onClose() {
        this.onLog('onClose');
    }

    /**
     * Event fired when metadata is present in the stream
     * @param metadata
     * @event
     */
    onMetadata(metadata: Metadata) {
        this.onLog(Util.stringify(metadata));
    }

    /**
     * URL of the connection
     */
    get url(): string {
        return this._ws.url;
    }

    /**
     * Returns the ConnectParams object containing the connection parameters
     */
    get connectParams(): Connect.Params {
        return this._connectParams;
    }
    /**
     * Returns the {@link Metadata} object description
     */
    get metadata(): Metadata | undefined {
        return this._metadata;
    }

    /**
     * Returns true if the connection is closed
     */
    get closed(): boolean {
        return this._ws.closed;
    }

    private _ws: WebSocketReliable;
    private _metadata?: Metadata;
    private _connectParams: Connect.Params;
    /**
     * Create a new StreamMetadata instance, connects to the server using WebSocket and
     * listen to metadata events.
     */
    constructor(connectParams: Connect.Params) {
        super();
        this._connectParams = connectParams;
        this._ws = new WebSocketReliable(Connect.buildURL(Connect.Type.META, connectParams));
        this._ws.onClose = (error?: string) => {
            this._metadata = new Metadata(); // reset metadata
            if (error) {
                this.onError(error);
            }
            this.onClose();
        };
        this._ws.onMessage = (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.error) {
                    throw data.error;
                } // Mist issue

                this._metadata = new Metadata();
                this._metadata.type = data.type;
                this._metadata.width = data.width;
                this._metadata.height = data.height;

                this._metadata.sources.clear();
                for (const source of data.source) {
                    this._metadata.sources.set(source.hrn, source);
                }

                const tracks = [];

                this._metadata.tracks.clear();
                for (const [name, track] of Util.objectEntries(data.meta.tracks)) {
                    track.name = name;
                    track.type = track.type.toLowerCase();
                    switch (track.type) {
                        case 'audio':
                            this._metadata.audios.push(track);
                            continue;
                        case 'video':
                            this._metadata.videos.push(track);
                            continue;
                        case 'meta':
                            track.type = MType.DATA; // Fix meta string to explicit DATA type
                            this._metadata.datas.push(track);
                            break;
                        default:
                            this.onLog('Unknown track type' + track.type);
                    }
                    tracks.push(track);
                }

                // Sorts audios/videos by descending BPS
                this._addSortedTrack(this._metadata.audios, this._metadata.tracks);
                this._addSortedTrack(this._metadata.videos, this._metadata.tracks);
                for (const track of tracks) {
                    this._metadata.tracks.set(track.idx, track);
                }
            } catch (e) {
                this.onError(Util.stringify(e));
                return;
            }

            // Announce metadata change
            this.onMetadata(this._metadata);
        };
    }

    /**
     * Close the stream metadata channel
     */
    close(error?: string) {
        this._ws.close(error);
    }

    private _addSortedTrack(medias: Array<MTrack>, tracks: Map<number, MTrack>) {
        medias.sort(sortByMAXBPS);
        for (let i = 0; i < medias.length; ++i) {
            const media = medias[i];
            tracks.set(media.idx, media); // sorted by descending BPS!
            if (i) {
                media.up = medias[i - 1];
                medias[i - 1].down = media;
            }
        }
    }
}
