/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { StreamMetadata } from './metadata/StreamMetadata';
import { ILog, Connect, Util, EventEmitter } from '@ceeblue/web-utils';
import { ConnectionInfos, IConnector } from './connectors/IConnector';
import { IController, IsController, PlayingInfos } from './connectors/IController';
import { WSController } from './connectors/WSController';
import { HTTPConnector } from './connectors/HTTPConnector';
import { MType, Metadata } from './metadata/Metadata';
import { IStreamData } from './metadata/IStreamData';
import { WSStreamData } from './metadata/WSStreamData';
import { MBRAbstract, MBRParams } from './mbr/MBRAbstract';
import { MBRLinear } from './mbr/MBRLinear';

const RECONNECTION_TIMEOUT: number = 1000;

/**
 * Use Player to start playing a WebRTC stream.
 * You can use a controllable version using a `WSController` as connector, or change it to use a `HTTPConnector` (HTTP WHEP).
 * By default it uses a `WSController` excepting if on {@link Player.start} you use a {@link Connect.Params.endPoint} prefixed with a `http://` protocol.
 * With a controllable connector you can change track during the playback, what is not possible with a HTTP(WHEP) connector.
 *
 * In addition then a player with a controllable connector uses a MultiBitrate algorithm to switch track automatically
 * regarding network congestion. You can disable it and fix manually a track by selecting it after a start call.
 * At last it's possible to indicate which are tracks to play in first by setting audio and video tracks before
 * start call. In this case it can be usefull to get metadata information about the stream before to play it,
 * see {@link Player.start} to achieve it.
 *
 * @example
 * const player = new Player();
 * // const player = new Player(isWHEP ? HTTPConnector : WSController);
 * player.onStart = stream => {
 *    videoElement.srcObject = stream;
 *    console.log('start playing');
 * }
 * player.onStop = _ => {
 *    console.log('stop playing');
 * }
 * // optionnaly set initial video track to play before start() call
 * player.videoTrack = 1;
 * // start playback
 * player.start({
 *    endPoint: address, // if address is prefixed by `http://` it uses a HTTPConnector (HTTP-WHEP) if Player is build without contructor argument
 *    streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
 * });
 * // Tracks are in a MBR mode: video track 1 can change regarding network congestion
 * ...
 * // Fix video track to 2, disable MBR mode
 * player.videoTrack = 2;
 * ...
 * player.stop();
 *
 */
export class Player extends EventEmitter implements ILog {
    /**
     * @override{@inheritDoc ILog.onLog}
     */
    onLog(log: string) {}

    /**
     * @override{@inheritDoc ILog.onError}
     */
    onError(error: string = 'unknown') {
        console.error(error);
    }

    /**
     * Event fired when streaming starts
     * @param stream
     */
    onStart(stream: MediaStream) {
        this.onLog('onStart');
    }

    /**
     * Event fired when streaming stops
     */
    onStop() {
        this.onLog('onStop');
    }

    /**
     * Event fired every second to report information while content plays
     * @param playing
     */
    onPlaying(playing: PlayingInfos) {
        console.debug('onPlaying ' + Util.stringify(playing));
    }

    /**
     * Event fired when metadata is present in the stream
     * @param metadata
     */
    onMetadata(metadata: Metadata) {
        this.onLog(Util.stringify(metadata));
    }

    /**
     * Event fired when data is received in the stream
     * @param time
     * @param track
     * @param data
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onData(time: number, track: number, data: any) {
        this.onLog(`Data received on track ${track} at ${time} : ${Util.stringify(data)}`);
    }

    /**
     * Stream name, for example `as+bc3f535f-37f3-458b-8171-b4c5e77a6137`
     */
    get streamName(): string {
        return this._connector ? this._connector.streamName : '';
    }

    /**
     * Playable media stream as specified by [MediaStream](https://developer.mozilla.org/docs/Web/API/MediaStream)
     */
    get stream(): MediaStream | undefined {
        return this._connector && this._connector.stream;
    }

    /**
     * Returns true when player is running (between a {@link Player.start} and a {@link Player.stop})
     */
    get running(): boolean {
        return this._connector ? true : false;
    }

    /**
     * Returns the {@link IController} instance when starting with a connector with controllable ability,
     * or undefined if stream is not starting or stream is not controllable.
     */
    get controller(): IController | undefined {
        return this._controller;
    }

    /**
     * Returns the {@link IConnector} instance, or undefined if stream is not starting.
     */
    get connector(): IConnector | undefined {
        return this._connector;
    }

    /**
     * Returns the {@link Metadata} object description
     */
    get metadata(): Metadata | undefined {
        return this._metadata;
    }

    /**
     * Last playing information, such as current position and playback buffer bounds
     * See {@link PlayingInfos}
     */
    get playingInfos(): PlayingInfos | undefined {
        return this._playingInfos;
    }

    /**
     * Index of the audio track, can be undefined if player is not playing
     */
    get audioTrack(): number | undefined {
        return this._audioTrack;
    }

    /**
     * Sets the current audio track to the index provided, it can be set before calling {@link Player.start}
     * to select the initial audio track, or set after {@link Player.start} to fix track and disable MBR
     * While playing you can set it to `undefined` to activate MBR when session is controllable
     */
    set audioTrack(idx: number | undefined) {
        this._audioTrackFixed = idx != null;
        if (!this._audioTrackFixed) {
            return;
        }
        if (this._audioTrack === idx) {
            return;
        }
        this._audioTrack = idx; // no check because can be used on start to select initial track!
        if (this._connector) {
            if (!this._controller) {
                throw Error('Cannot set audioTrack without start a controllable session');
            }
            this._controller.setTracks({ audio: idx });
        }
    }

    /**
     * Index of the video track, can be undefined if player is not playing
     */
    get videoTrack(): number | undefined {
        return this._videoTrack;
    }

    /**
     * Sets the current video track to the index provided, it can be set before calling {@link Player.start}
     * to select the initial video track, or set after {@link Player.start} to fix track and disable MBR
     * While playing you can set it to `undefined` to activate MBR when session is controllable
     */
    set videoTrack(idx: number | undefined) {
        this._videoTrackFixed = idx != null;
        if (!this._videoTrackFixed) {
            return;
        }
        if (this._videoTrack === idx) {
            return;
        }
        this._videoTrack = idx; // no check because can be used on start to select initial track!
        if (this._connector) {
            if (!this._controller) {
                throw Error('Cannot set videoTrack without start a controllable session');
            }
            this._controller.setTracks({ video: idx });
        }
    }

    /**
     * The list of tracks currently receiving
     */
    get dataTracks(): Array<number> {
        return [...this._dataTracks];
    }

    /**
     * Set the data track ids to receive
     */
    set dataTracks(tracks: Array<number>) {
        this._dataTracks = [...tracks];
        if (this._streamData) {
            this._streamData.tracks = tracks;
        }
    }

    private _connector?: IConnector;
    private _controller?: IController;
    private _streamMetadata?: StreamMetadata;
    private _audioTrack?: number;
    private _videoTrack?: number;
    private _audioTrackFixed?: boolean;
    private _videoTrackFixed?: boolean;
    private _dataTracks: Array<number>;
    private _playingInfos?: PlayingInfos;
    private _streamData?: IStreamData;
    private _metadata?: Metadata;
    /**
     * Constructs a new Player instance, optionally with a custom connector
     * This doesn't start the playback, you must call {@link Player.start} method
     * By default if no connector is indicated it uses a  {@link WSController} (WebSocket {@link IController})
     * excepting if {@link Connect.Params.endPoint} is prefixed with a `http://` protocol in such case it uses
     * instead a {@link HTTPConnector} (HTTP {@link IConnector}). To force a HTTPConnector build explicitly
     * with {@link HTTPConnector} as Connector argument.
     * @param Connector Connector class to use for signaling, or nothing to let's {@link Player.start} method determines it automatically.
     * @example
     * // Default build
     * const player = new Player();
     * player.start({
     *    endPoint: address, // if address is prefixed by `http://` it uses a HTTPConnector (HTTP-WHIP), otherwise it uses a WSController (WebSocket)
     *    streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
     * });
     * // Force connector selection whatever the address used in endPoint
     * const player = new Player(isWHIP ? HTTPConnector : WSController);
     * player.start({
     *   endPoint: address, // optional protocol prefix has no incidence on connector selection
     *  streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
     * })
     */
    constructor(private Connector?: { new (connectParams: Connect.Params): IConnector }) {
        super();
        this._dataTracks = new Array<number>();
    }

    /**
     * Returns connection info, such as round trip time, requests sent and received,
     * bytes sent and received, and bitrates
     * NOTE: This call is resource-intensive for the CPU.
     * @returns {Promise<ConnectionInfos>} A promise for a ConnectionInfos
     */
    connectionInfos(): Promise<ConnectionInfos> {
        if (!this._connector) {
            return Promise.reject('Start player before to request connection infos');
        }
        return this._connector.connectionInfos();
    }

    /**
     * Starts playing the stream
     * The connector is determined automatically from {@link Connect.Params.endPoint} if not forced in the constructor.
     *
     * Instead to use a {@link Connect.Params} you can prefer use a already built {@link StreamMetadata} instance to
     * the same end-point, it allows to discover tracks in amount and initialize track selection to start playback.
     *
     * The `multiBitrate` option can take three different types of value:
     *  - A {@link MBRParams} object to configured the default MBRLinear implementation, default value `{}`
     *  - `undefined` to disable MBR management
     *  - Use a custom {@link MBRAbstract} implementation instance
     *
     * In addition you can disable MBR while playing by set audio or video track to an explicit value ({@link Player.videoTrack} and {@link Player.audioTrack}).
     *
     * @param params Connection parameters or a StreamMetadata object already connected to the same end-point
     * Note that if you pass a StreamMetadata object its life-time management is fully delegated to the Player
     * @param multiBitrate Multi-bitrate implementation or MBRParams to configure the default implementation
     * @example
     * // Default start with MBR activated
     * player.start({
     *    endPoint: address,
     *    streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
     * });
     * // Start with selected initial track, in using a StreamMetadata object preinitialized
     * const streamMetadata = new StreamMetadata({
     *    endPoint: address,
     *    streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
     * });
     * streamMetadata.onMetadata = metadata => {
     *    // start to play with higher bitrate selection (audios and videos are sorted by descending BPS)
     *    player.audioTrack = metadata.audios[0].idx;
     *    player.videoTrack = metadata.videos[0].idx;
     *    // give the streamMetadata channel to reuse instead of opening a new again
     *    player.start(streamMetadata);
     *    // Now MBR select automatically the best tracks regarding network congestion
     *    ...
     *    // Fix audioTrack to the high rendition (disable MBR for audio track)
     *    player.audioTrack = 1;
     *    ...
     *    // Reactivate MBR for audio
     *    player.audioTrack = undefined;
     * }
     */
    start(params: Connect.Params | StreamMetadata, multiBitrate: MBRAbstract | MBRParams | undefined = {}) {
        this.stop();
        // Connector
        let mbr: MBRAbstract;
        let playing: PlayingInfos;
        // Init Metadata channel
        if ('connectParams' in params) {
            // params is StreamMetadata
            this._initStreamMetadata({ ...params.connectParams }, params); // copy connect params to become immutable on reconnection
            params = params.connectParams;
        } else {
            this._initStreamMetadata({ ...params }, new StreamMetadata(params)); // copy connect params to become immutable on reconnection
        }
        // Add initial tracks query params
        if (this._audioTrack != null) {
            params.query = Object.assign({ audio: this._audioTrack.toFixed() }, params.query);
        }
        if (this._videoTrack != null) {
            params.query = Object.assign({ video: this._videoTrack.toFixed() }, params.query);
        }
        this._audioTrackFixed = false;
        this._videoTrackFixed = false;
        this._connector = new (this.Connector || (params.endPoint.startsWith('http') ? HTTPConnector : WSController))(
            params
        );
        this._connector.onLog = log => this.onLog('Signaling: ' + log);
        this._connector.onError = error => this.onError('Signaling: ' + error);
        this._connector.onOpen = stream => {
            this.onStart(stream);
            // metadata in first!
            if (this._streamMetadata?.metadata) {
                this._streamMetadata.onMetadata(this._streamMetadata?.metadata);
            }
            // playing infos in second!!
            if (playing && this._controller) {
                this._controller.onPlaying(playing);
            }
        };
        this._connector.onClose = () => {
            mbr?.reset(); // reset to release resources!
            this.stop(); // Stop the player if signaling fails!
        };

        // Timed Metadatas
        this._newStreamData({ ...params }); // copy connect params to be immutable on reconnection

        if (!IsController(this._connector)) {
            if (multiBitrate) {
                this.onLog(
                    'Cannot use a multiple bitrate without a controller: Connector ' +
                        this._connector.constructor.name +
                        " doesn't implements IController"
                );
            }
            return;
        }

        if (multiBitrate) {
            if ('compute' in multiBitrate) {
                // MBRAbstract instance
                mbr = multiBitrate;
            } else {
                // MBRParams
                mbr = new MBRLinear(multiBitrate);
                mbr.onLog = log => this.onLog('MultiBitrate: ' + log);
            }
        }

        // Controller
        this._controller = this._connector;
        let connectionInfos: ConnectionInfos;
        this._controller.onPlaying = async value => {
            playing = value;
            if (!this._controller || !this._controller.opened) {
                return;
            }
            this._playingInfos = playing;
            this._updateTracks();
            this.onPlaying(playing);
            if (!mbr) {
                return;
            }
            if (this._audioTrackFixed && this._videoTrackFixed) {
                mbr.reset();
                return;
            }
            try {
                // Read connectioninfos every seconds to prevent wrong MBR computation with too much granularity
                const infos = await this._controller.connectionInfos(1000);
                if (infos === connectionInfos) {
                    // no connectionnInfos update => no need to recompute!
                    return;
                }
                const tracks = {
                    audio: this._audioTrackFixed ? undefined : this._audioTrack,
                    video: this._videoTrackFixed ? undefined : this._videoTrack
                };
                if (
                    this._controller &&
                    this._metadata &&
                    mbr.compute(this._metadata, tracks, (connectionInfos = infos).inputs)
                ) {
                    this._audioTrack = tracks.audio;
                    this._videoTrack = tracks.video;
                    this._controller.setTracks(tracks);
                }
            } catch (e) {
                this.onError("Can't compute MBR, " + Util.stringify(e));
            }
        };
    }

    /**
     * Stops playing the stream
     */
    stop() {
        const connector = this._connector;
        if (!connector) {
            return;
        }
        this._connector = undefined;
        // Stream metadata
        if (this._streamMetadata) {
            this._streamMetadata.close();
            this._streamMetadata = undefined;
        }
        // Stream data
        if (this._streamData) {
            this._streamData.close();
            this._streamData = undefined;
        }
        // Signaling
        connector.close();
        // Reset some value
        this._audioTrack = undefined;
        this._videoTrack = undefined;
        this._dataTracks.length = 0;
        this._playingInfos = undefined;
        this._metadata = undefined;
        // User event (always in last)
        this.onStop();
    }

    private _updateTracks() {
        if (!this._playingInfos || !this._metadata) {
            return;
        }
        // Set _audioTrack and _videoTrack regarding playingInfos + metadata
        const audios = new Array<number>();
        const videos = new Array<number>();
        for (const track of this._playingInfos.tracks) {
            const mTrack = this._metadata.tracks.get(track);
            if (!mTrack) {
                continue;
            }
            if (mTrack.type === MType.AUDIO) {
                audios.push(track);
            } else if (mTrack.type === MType.VIDEO) {
                videos.push(track);
            }
        }
        // Check that we have only ONE for every type: on track switching we can have multiple track with same type
        // In this case wait end of MBR switch
        if (audios.length === 1) {
            this._audioTrack = audios[0];
        }
        if (videos.length === 1) {
            this._videoTrack = videos[0];
        }
    }

    private _initStreamMetadata(params: Connect.Params, streamMetadata: StreamMetadata) {
        this._streamMetadata = streamMetadata;
        streamMetadata.onLog = log => this.onLog('StreamMetadata: ' + log);
        streamMetadata.onError = error => this.onError('StreamMetadata: ' + error);
        streamMetadata.onMetadata = metadata => {
            if (!this._connector || !this._connector.opened) {
                return;
            }
            this._metadata = metadata.subset(this._connector.codecs);
            this._updateTracks();
            this.onMetadata(this._metadata);
        };
        streamMetadata.onClose = () => {
            this.onLog('StreamMetadata closed, trying to reconnect in ' + RECONNECTION_TIMEOUT + 'ms');
            // Manage reconnection!
            setTimeout(() => {
                if (this._streamMetadata === streamMetadata) {
                    this._initStreamMetadata(params, new StreamMetadata(params));
                } // else has changed! or player is closed!
            }, RECONNECTION_TIMEOUT);
        };
    }

    private _newStreamData(params: Connect.Params) {
        const streamData = (this._streamData = new WSStreamData(params));
        streamData.onLog = log => this.onLog('Timed Metadatas: ' + log);
        streamData.onError = error => this.onError('Timed Metadatas: ' + error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        streamData.onData = (time: number, track: number, data: any) => this.onData(track, time, data);
        streamData.tracks = this._dataTracks; // initialize data tracks
        streamData.onClose = () => {
            this.onLog('Timed Metadatas closed, trying to reconnect in ' + RECONNECTION_TIMEOUT + 'ms');
            // Manage reconnection!
            setTimeout(() => {
                if (this._streamData === streamData) {
                    this._newStreamData(params);
                } // else has changed! or player is closed!
            }, RECONNECTION_TIMEOUT);
        };
    }
}
