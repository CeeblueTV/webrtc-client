/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Connect, EventEmitter, ILogger, NetAddress, NullLogger, Util } from '@ceeblue/web-utils';
import { ConnectionInfos, IConnector } from './IConnector';
import * as sdpTransform from 'sdp-transform';

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/**
 * Set stereo=1 for the opus codecs in the sdp
 * This is necessary for the opus codec to work in stereo mode
 * on browsers like Safari and Chrome
 *
 * @param sdp the original sdp
 * @returns the sdp with stereo=1 for the opus codecs
 */
function setStereoForOpus(sdp: string): string {
    const sdpObj = sdpTransform.parse(sdp);
    for (const media of sdpObj.media) {
        if (media.type === 'audio') {
            const opusPayloads = [];
            // Search for the opus codec payload ID in rtpmap
            for (const rtp of media.rtp) {
                if (rtp.codec === 'opus') {
                    opusPayloads.push(rtp.payload);
                }
            }
            if (!opusPayloads.length) {
                continue;
            }
            // Set stereo=1 for the opus codecs fmtp
            for (const fmtp of media.fmtp) {
                if (opusPayloads.includes(fmtp.payload)) {
                    const newConfig = sdpTransform.parseParams(fmtp.config);
                    newConfig.stereo = 1;
                    fmtp.config = '';
                    for (const key in newConfig) {
                        fmtp.config += (fmtp.config ? ';' : '') + key + '=' + newConfig[key];
                    }
                }
            }
        }
    }
    return sdpTransform.write(sdpObj);
}

/**
 * SIPConnector is a common abstract class for negotiating a new RTCPeerConnection connection
 * with the server.
 *
 * The child class must implement the _sip method to send the offer to the server and get the answer.
 */
export abstract class SIPConnector extends EventEmitter implements IConnector {
    /**
     * @override{@inheritDoc IConnector.onOpen}
     * @event
     */
    onOpen(stream: MediaStream) {
        this._logger.log('onOpen');
    }

    /**
     * @override{@inheritDoc IConnector.onClose}
     * @event
     */
    onClose() {
        this._logger.log('onClose');
    }

    /**
     * @override{@inheritDoc IConnector.opened}
     */
    get opened(): boolean {
        return this._peerConnection && this._peerConnection.ontrack === Util.EMPTY_FUNCTION ? true : false;
    }

    /**
     * @override{@inheritDoc IConnector.closed}
     */
    get closed(): boolean {
        return this._closed;
    }

    /**
     * @override{@inheritDoc IConnector.stream}
     */
    get stream(): MediaStream | undefined {
        return this._stream;
    }

    /**
     * @override{@inheritDoc IConnector.streamName}
     */
    get streamName(): string {
        return this._streamName;
    }

    /**
     * @override{@inheritDoc IConnector.codecs}
     */
    get codecs(): Set<string> {
        return this._codecs;
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

    private _streamName: string;
    private _endPoint: string;
    private _stream?: MediaStream;
    private _peerConnection?: RTCPeerConnection;
    private _closed: boolean;
    private _connectionInfos?: ConnectionInfos;
    private _connectionInfosTime: number;
    private _codecs: Set<string>;
    protected _logger: ILogger;

    /**
     * Create a new SIPConnector instance. The RTCPeerConnection is created only when calling _open().
     *
     * By default, a listener channel is negotiated.
     * To create a streamer channel, pass a stream parameter.
     */
    constructor(connectParams: Connect.Params, stream?: MediaStream) {
        super();
        this._logger = new NullLogger();
        this._closed = false;
        this._streamName = connectParams.streamName;
        this._endPoint = connectParams.endPoint;
        this._stream = stream;
        this._connectionInfosTime = 0;
        this._codecs = new Set<string>();
    }

    /**
     * Returns connection info, such as round trip time, requests sent and received,
     * bytes sent and received, and bitrates
     * NOTE: This call is resource-intensive for the CPU.
     * @returns {Promise<ConnectionInfos>} A promise that resolves to an RTCStatsReport object
     */
    async connectionInfos(cacheDuration: number = 1000): Promise<ConnectionInfos> {
        if (!this._peerConnection) {
            return Promise.reject('Not connected');
        }
        // update only evey seconds!
        if (!this._connectionInfos || Util.time() - cacheDuration > this._connectionInfosTime) {
            const infos = await this._peerConnection.getStats(null);
            this._connectionInfos = {
                inputs: {},
                outputs: {}
            };
            const tracks = new Map();
            const rtps = new Map();
            for (const info of infos.values()) {
                // info.kind|mediaType
                // => in a previous implementation 'kind' was named 'mediaType'
                // see https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats#standard_fields_included_for_all_media_types
                switch (info.type) {
                    case 'track':
                        tracks.set(info.id, info);
                        break;
                    case 'outbound-rtp':
                        rtps.set(info.trackId, info);
                        this._connectionInfos.outputs[(info.kind || info.mediaType) === 'audio' ? 'audio' : 'video'] =
                            info;
                        break;
                    case 'inbound-rtp':
                        rtps.set(info.trackId, info);
                        this._connectionInfos.inputs[(info.kind || info.mediaType) === 'audio' ? 'audio' : 'video'] =
                            info;
                        break;
                    case 'candidate-pair':
                        if (info.selected != null) {
                            if (!info.selected) {
                                continue;
                            }
                        } else if (info.nominated != null) {
                            if (!info.nominated) {
                                continue;
                            }
                        }
                        this._connectionInfos.candidate = info;
                        break;
                }
            }
            // Report track infos with inbound/outbound-rtp (safari requirement!)
            for (const [id, track] of tracks) {
                const rtp = rtps.get(id);
                if (rtp) {
                    Object.assign(rtp, { ...track, ...rtp });
                }
            }
            this._connectionInfosTime = Util.time();
        }
        return this._connectionInfos;
    }

    /**
     * @override{@inheritDoc IConnector.close}
     */
    close(error?: string) {
        if (this._closed) {
            return;
        } // Already closed!
        this._closed = true;
        const peerConnection = this._peerConnection;
        if (peerConnection) {
            this._peerConnection = undefined;
            // Stop all tracks
            peerConnection.getReceivers().forEach(receiver => receiver.track && receiver.track.stop());
            peerConnection.getSenders().forEach(sender => sender.track && sender.track.stop());
            // Close
            peerConnection.close();
        }
        if (this._stream) {
            this._stream.getTracks().forEach(track => track.stop());
        }
        if (error) {
            this._logger.error(error);
        }
        this.onClose();
    }

    /**
     * Operates Session Initiation Protocol, this method implement the logic
     * to send the SDP offer to the server and get the SDP answer in response.
     *
     * @param offer SIP Offer
     * @returns a Promise with SIP Answer as result
     */
    protected abstract _sip(offer: string): Promise<string>;

    /**
     * Main function which creates the RTCPeerConnection, creates the offer,
     * calls the _sip method, then set the answer and calls onOpen
     */
    protected _open(iceServer?: RTCIceServer) {
        // If iceServer is not provided, use the default one
        if (!iceServer) {
            const domain = new NetAddress(this._endPoint, 443).domain;
            iceServer = {
                urls: ['turn:' + domain + ':3478?transport=tcp', 'turn:' + domain + ':3478'],
                username: 'csc_demo',
                credential: 'UtrAFClFFO'
            };
        }
        // Start the RTCPeerConnection and create an offer
        try {
            this._peerConnection = new RTCPeerConnection({ iceServers: [iceServer] });
        } catch (e) {
            this.close('RTCPeerConnection failed, ' + Util.stringify(e));
            return;
        }
        if (this._stream) {
            // streamer
            for (const track of this._stream.getTracks()) {
                this._peerConnection.addTrack(track);
            }
        } else {
            // listener
            this._peerConnection.ontrack = ev => {
                this._stream = ev.streams[0];
                this._tryToOpen();
            };
        }

        // Add transceivers for Safari
        // This is necessary for Safari to handle the audio and video tracks correctly
        if (isSafari) {
            if (!this._stream) {
                this._peerConnection.addTransceiver('audio', { direction: 'recvonly' });
                this._peerConnection.addTransceiver('video', { direction: 'recvonly' });
            } else {
                const transceivers = this._peerConnection.getTransceivers();
                for (const transceiver of transceivers) {
                    if (transceiver.receiver.track.kind === 'audio' || transceiver.receiver.track.kind === 'video') {
                        transceiver.direction = 'sendonly';
                    }
                }
            }
        }

        let sdp: string;
        this._peerConnection
            .createOffer({ offerToReceiveAudio: !this._stream, offerToReceiveVideo: !this._stream })
            .then(offer => {
                if (!this._peerConnection) {
                    return;
                }
                offer.sdp = sdp = offer.sdp ? setStereoForOpus(offer.sdp as string) : '';

                this._logger.log('Offer\r\n' + sdp);
                return this._peerConnection.setLocalDescription(offer);
            })
            .then(_ => {
                if (!this._peerConnection) {
                    return;
                } // has been closed!
                if (!sdp) {
                    return Promise.reject('invalid empty sdp offer');
                }
                return this._sip(sdp); // Send the offer to the backend and get answer!
            })
            .then(answer => {
                if (!answer || !this._peerConnection) {
                    return;
                } // has been closed!
                this.updateCodecs(answer);
                this._logger.log('Answer\r\n' + answer);
                return this._peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: answer })
                );
            })
            .then(() => this._tryToOpen())
            .catch(e => this.close('SIP failed, ' + Util.stringify(e)));
    }

    /**
     * Fill the codecs set with the codecs found in the sdp
     *
     * @param sdp the sdp to parse
     */
    private updateCodecs(sdp: string) {
        const sdpObj = sdpTransform.parse(sdp);
        for (const media of sdpObj.media) {
            for (const rtp of media.rtp) {
                this._codecs.add(rtp.codec.toLowerCase());
            }
        }
    }

    /**
     * To call onOpen just once
     */
    private _tryToOpen() {
        if (!this._stream || !this._peerConnection || this._peerConnection.ontrack === Util.EMPTY_FUNCTION) {
            return;
        }
        this._peerConnection.ontrack = Util.EMPTY_FUNCTION; // Just once!
        this.onOpen(this._stream);
    }
}
