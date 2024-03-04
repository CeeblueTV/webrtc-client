/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Connect, EventEmitter, NetAddress, SDP, Util } from '@ceeblue/web-utils';
import { ConnectionInfos, IConnector } from './IConnector';

/**
 * SIPConnector is a common abstract class for negotiating a new RTCPeerConnection connection
 * with the server.
 *
 * The child class must implement the _sip method to send the offer to the server and get the answer.
 */
export abstract class SIPConnector extends EventEmitter implements IConnector {
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
     * @override{@inheritDoc IConnector.onOpen}
     * @event
     */
    onOpen(stream: MediaStream) {
        this.onLog('onOpen');
    }

    /**
     * @override{@inheritDoc IConnector.onClose}
     * @event
     */
    onClose() {
        this.onLog('onClose');
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

    private _streamName: string;
    private _host: string;
    private _stream?: MediaStream;
    private _peerConnection?: RTCPeerConnection;
    private _closed: boolean;
    private _connectionInfos?: ConnectionInfos;
    private _connectionInfosTime: number;
    private _codecs: Set<string>;
    /**
     * Create a new SIPConnector instance. The RTCPeerConnection is created only when calling _open().
     *
     * By default, a listener channel is negotiated.
     * To create a streamer channel, pass a stream parameter.
     */
    constructor(connectParams: Connect.Params, stream?: MediaStream) {
        super();
        this._closed = false;
        this._streamName = connectParams.streamName;
        this._host = connectParams.host;
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
            this.onError(error);
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
            const domain = new NetAddress(this._host, 443).domain;
            iceServer = {
                urls: ['turn:' + domain + ':3478?transport=tcp', 'turn:' + domain + ':3478'],
                username: 'csc_demo',
                credential: 'UtrAFClFFO'
            };
        }
        // Start the RTCPeerConnection and create an offer
        try {
            this._peerConnection = new RTCPeerConnection(iceServer ? { iceServers: [iceServer] } : undefined);
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

        let sdp: string;
        this._peerConnection
            .createOffer({ offerToReceiveAudio: !this._stream, offerToReceiveVideo: !this._stream })
            .then(offer => {
                if (!this._peerConnection) {
                    return;
                }
                sdp = offer.sdp ?? '';
                this.onLog('Offer\r\n' + sdp);
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
                this.onLog('Answer\r\n' + answer);
                for (const media of SDP.fromString(answer)) {
                    if (!media.rtpmap) {
                        continue;
                    }
                    let found = media.rtpmap.indexOf(' ');
                    if (found < 0) {
                        continue;
                    }
                    let codec = media.rtpmap.substring(found + 1);
                    if (!codec) {
                        return;
                    }
                    found = codec.indexOf('/');
                    codec = found < 0 ? codec : codec.substring(0, found);
                    this._codecs.add(codec.toLowerCase());
                }
                return this._peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: answer })
                );
            })
            .then(() => this._tryToOpen())
            .catch(e => this.close('SIP failed, ' + Util.stringify(e)));
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
