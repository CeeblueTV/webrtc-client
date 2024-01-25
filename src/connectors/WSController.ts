/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { IController, RTPProps, PlayingInfos, MediaReport } from './IController';
import { Connect, ConnectType, ConnectParams } from '../utils/Connect';
import { Util } from '../utils/Util';
import { WebSocketReliable } from '../utils/WebSocketReliable';
import { SIPConnector } from './SIPConnector';

/**
 * Use WSController to negotiate a new RTCPeerConnection connection with the server
 * using WebSocket custom signaling and keep that connection open for communication.
 * @example
 * // Listener channel (no 'stream' parameter), listen to a stream without sending data
 * const connection = new WSController({host, streamName});
 * connection.onOpen = stream => videoElement.srcObject = stream;
 *
 * // Streamer channel (with 'stream' parameter), sends and receives media streams
 * const connection = new WSController({host, streamName}, {stream: await navigator.mediaDevices.getUserMedia()});
 * connection.onOpen = stream => {}
 */
export class WSController extends SIPConnector implements IController {
    /**
     * @override{@inheritDoc IController.onRTPProps}
     * @event
     */
    onRTPProps(rtpProps: RTPProps) {
        this.onLog('onRTPProps ' + Util.stringify(rtpProps));
    }

    /**
     * @override{@inheritDoc IController.onMediaReport}
     * @event
     */
    onMediaReport(mediaReport: MediaReport) {
        console.debug('onMediaReport ' + Util.stringify(mediaReport));
    }

    /**
     * @override{@inheritDoc IController.onVideoBitrate}
     * @event
     */
    onVideoBitrate(videoBitrate: number, videoBitrateConstraint: number) {
        this.onLog(
            'onVideoBitrate ' +
                Util.stringify({ video_bitrate: videoBitrate, video_bitrate_constraint: videoBitrateConstraint })
        );
    }

    /**
     * @override{@inheritDoc IController.onPlaying}
     * @event
     */
    onPlaying(playing: PlayingInfos) {
        console.debug('onPlaying ' + Util.stringify(playing));
    }

    private _ws: WebSocketReliable;
    private _promise?: { (result: string | Error): void };
    /**
     * Instantiate the WSController, connect to the WebSocket endpoint
     * and call _open() to create the RTCPeerConnection.
     *
     * By default, a listener channel is negotiated.
     * To create a streamer channel, pass a stream parameter.
     */
    constructor(connectParams: ConnectParams, stream?: MediaStream) {
        super(connectParams, stream);
        this._ws = new WebSocketReliable(Connect.buildURL(ConnectType.WEBRTC, connectParams, 'wss'));
        this._ws.onClose = (error?: string) => this.close(error);
        this._ws.onOpen = () => {
            // [ENG-142] Add a way to get the server's configuration for 'iceServers'
            this._open(connectParams.iceServer);
        };
        this._ws.onMessage = (message: string) => {
            try {
                this._eventHandler(JSON.parse(message));
            } catch (e) {
                this.onError('Invalid signaling message, ' + Util.stringify(e));
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
            this.onLog('Command ' + type + ' ' + Util.stringify(params));
            this._ws.send(JSON.stringify(Object.assign({ type }, params)));
        } catch (ex) {
            this.onError(Util.stringify(ex));
        }
    }

    /**
     * @override{@inheritDoc SIPConnector.close}
     */
    close(error?: string) {
        this._ws.close(error);
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
        //this.onLog('EventHandler ' + Util.stringify(ev));
        switch (ev.type) {
            case 'on_answer_sdp': {
                if (this._promise) {
                    this._promise(ev.answer_sdp);
                }
                break;
            }
            case 'on_error': {
                if (this.opened) {
                    this.onError(Util.stringify(ev));
                } else {
                    // error on start or offer/answer => irrecoverable error!
                    this.close(Util.stringify(ev));
                }
                break;
            }
            case 'on_video_bitrate': {
                this.onVideoBitrate(ev.video_bitrate, ev.video_bitrate_constraint);
                break;
            }
            case 'on_stop': {
                this.onLog('on_stop');
                // Close the signaling channel when live stream on_stop
                this.close();
                break;
            }
            case 'on_track_drop': {
                const mediatype = ev.mediatype ?? '?';
                const trackId = ev.track ?? '?';
                this.onError(mediatype + ' track #' + trackId + 'dropped');
                break;
            }
            case 'on_rtp_props': {
                this.onRTPProps(ev);
                break;
            }
            case 'on_media_receive': {
                this.onMediaReport(ev);
                break;
            }
            case 'on_seek': {
                // ignore on_seek, no need!
                break;
            }
            case 'on_time': {
                this.onPlaying(ev);
                break;
            }
            default: {
                this.onError('Unhandled event: ' + ev.type);
                break;
            }
        }
    }
}
