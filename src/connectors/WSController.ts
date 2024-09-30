/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { IController, RTPProps, PlayingInfos, MediaReport } from './IController';
import { Connect, Util, WebSocketReliable, WebSocketReliableError } from '@ceeblue/web-utils';
import { SIPConnector } from './SIPConnector';
import { ConnectorError } from './IConnector';

const REPORT_WATCHDOG_TIMEOUT = 30000;

/**
 * Use WSController to negotiate a new RTCPeerConnection connection with the server
 * using WebSocket custom signaling and keep that connection open for communication.
 * @example
 * // Listener channel (no 'stream' parameter), listen to a stream without sending data
 * const connection = new WSController({endPoint, streamName});
 * connection.onOpen = stream => videoElement.srcObject = stream;
 *
 * // Streamer channel (with 'stream' parameter), sends and receives media streams
 * const connection = new WSController({endPoint, streamName}, {stream: await navigator.mediaDevices.getUserMedia()});
 * connection.onOpen = stream => {}
 */
export class WSController extends SIPConnector implements IController {
    /**
     * @override{@inheritDoc IController.onRTPProps}
     * @event
     */
    onRTPProps(rtpProps: RTPProps) {}

    /**
     * @override{@inheritDoc IController.onMediaReport}
     * @event
     */
    onMediaReport(mediaReport: MediaReport) {}

    /**
     * @override{@inheritDoc IController.onVideoBitrate}
     * @event
     */
    onVideoBitrate(videoBitrate: number, videoBitrateConstraint: number) {
        this.log(
            `onVideoBitrate ${Util.stringify({ video_bitrate: videoBitrate, video_bitrate_constraint: videoBitrateConstraint })}`
        ).info();
    }

    /**
     * @override{@inheritDoc IController.onPlaying}
     * @event
     */
    onPlaying(playing: PlayingInfos) {
        this.log(`onPlaying ${Util.stringify(playing)}`).debug();
    }

    private _ws: WebSocketReliable;
    private _promise?: { (result: string | Error): void };
    private _reportWatchdogInterval?: NodeJS.Timeout;
    private _reportReceivedTimestamp?: number;

    /**
     * Instantiate the WSController, connect to the WebSocket endpoint
     * and call _open() to create the RTCPeerConnection.
     *
     * By default, a listener channel is negotiated.
     * To create a streamer channel, pass a stream parameter.
     */
    constructor(connectParams: Connect.Params, stream?: MediaStream) {
        super(connectParams, stream);
        this._ws = new WebSocketReliable(Connect.buildURL(Connect.Type.WEBRTC, connectParams, 'wss'));
        this._ws.onClose = (error?: WebSocketReliableError) => this.close(error);
        this._ws.onOpen = () => {
            this._startReportWatchdog();
            // [ENG-142] Add a way to get the server's configuration for 'iceServers'
            this._open(connectParams.iceServer);
        };
        this._ws.onMessage = (message: string) => {
            try {
                this._eventHandler(JSON.parse(message));
            } catch (e) {
                this.log(`Invalid signaling message, ${Util.stringify(e)}`).warn();
            }
        };
    }

    /**
     * @override{@inheritDoc IController.setRTPProps}
     */
    setRTPProps(nack?: number, drop?: number) {
        this.send('rtp_props', { nack, drop });
    }

    /**
     * @override{@inheritDoc IController.setVideoBitrate}
     */
    setVideoBitrate(value: number) {
        this.send('video_bitrate', { video_bitrate: value });
    }

    /**
     * @override{@inheritDoc IController.setTracks}
     */
    setTracks(tracks: { audio?: number; video?: number }) {
        this.send('tracks', tracks);
    }

    /**
     * @override{@inheritDoc IController.send}
     */
    send(type: string, params: object) {
        try {
            // Send immediatly when SIPConnector is opened (offer+answed)
            // OR delay command sending (will be flushed one time onOpen)
            this.log(`Command ${type} ${Util.stringify(params)}`).info();
            this._ws.send(JSON.stringify(Object.assign({ type }, params)));
        } catch (ex) {
            this.log(Util.stringify(ex)).error();
        }
    }

    /**
     * @override{@inheritDoc SIPConnector.close}
     */
    close(error?: ConnectorError) {
        if (this._ws.onClose === Util.EMPTY_FUNCTION) {
            return;
        }
        this._ws.onClose = Util.EMPTY_FUNCTION;
        this._ws.close();
        this._clearReportWatchdog();
        if (this._promise) {
            this._promise(Error('closing'));
            this._promise = undefined;
        }
        super.close(error);
    }

    /**
     * @override{@inheritDoc SIPConnector._sip}
     */
    protected _sip(offer: string): Promise<string> {
        return new Promise<string>((onSuccess, onFail) => {
            this._promise = (result: string | Error) => {
                if (result instanceof Error) {
                    onFail(result);
                } else {
                    onSuccess(result);
                }
            };
            this._ws.send(JSON.stringify({ type: 'offer_sdp', offer_sdp: offer }));
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected _eventHandler(ev: any) {
        this.log(`EventHandler ${Util.stringify(ev, { recursion: 2 })}`).debug();

        switch (ev.type) {
            case 'on_answer_sdp': {
                if (ev.result === true) {
                    if (this._promise) {
                        this._promise(ev.answer_sdp);
                    }
                } else {
                    this.close({ type: 'ConnectorError', name: 'Access denied' });
                }
                break;
            }
            case 'on_error': {
                if (this.opened) {
                    this.log(Util.stringify(ev)).warn();
                } else {
                    // error on start or offer/answer => irrecoverable error!
                    this.close({ type: 'ConnectorError', name: 'Connection failed', detail: Util.stringify(ev) });
                }
                break;
            }
            case 'on_video_bitrate': {
                this.onVideoBitrate(ev.video_bitrate, ev.video_bitrate_constraint);
                break;
            }
            case 'on_stop': {
                this.log('on_stop').info();
                // Close the signaling channel when live stream on_stop
                this.close();
                break;
            }
            case 'on_track_drop': {
                const mediatype = ev.mediatype ?? '?';
                const trackId = ev.track ?? '?';
                this.log(`${mediatype} track #${trackId} dropped`).warn();
                break;
            }
            case 'on_rtp_props': {
                this.onRTPProps(ev);
                break;
            }
            case 'on_media_receive': {
                this._reportReceivedTimestamp = Util.time();
                this.onMediaReport(ev);
                break;
            }
            case 'on_seek': {
                // ignore on_seek, no need!
                break;
            }
            case 'on_time': {
                this._reportReceivedTimestamp = Util.time();
                this.onPlaying(ev);
                break;
            }
            default: {
                this.log(`Unhandled event: ${ev.type}`).warn();
                break;
            }
        }
    }

    private _startReportWatchdog() {
        this._reportReceivedTimestamp = Util.time();

        this._reportWatchdogInterval = setInterval(() => {
            const timeout = this._reportReceivedTimestamp
                ? Util.time() - this._reportReceivedTimestamp
                : REPORT_WATCHDOG_TIMEOUT;
            if (timeout >= REPORT_WATCHDOG_TIMEOUT / 3) {
                this.log(`No updates received for the last ${(timeout / 1000).toFixed(1)}s`).warn();
            }
            if (timeout >= REPORT_WATCHDOG_TIMEOUT) {
                this.close({ type: 'ConnectorError', name: 'Connection idle error' });
            }
        }, REPORT_WATCHDOG_TIMEOUT / 6);
    }

    private _clearReportWatchdog() {
        if (this._reportWatchdogInterval) {
            clearInterval(this._reportWatchdogInterval);
            this._reportWatchdogInterval = undefined;
        }
    }
}
