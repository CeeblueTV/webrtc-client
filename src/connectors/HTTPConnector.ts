/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Connect } from '@ceeblue/web-utils';
import { SIPConnector } from './SIPConnector';

/**
 * Use HTTPConnector to negotiate a new RTCPeerConnection connection with the server
 * using WHIP (WebRTC HTTP Ingest Protocol) or WHEP (WebRTC HTTP Egress Protocol).
 * @example
 * // Listener channel (no initial 'stream' parameter), listen to a stream without sending data
 * const connection = new HTTPConnector({endPoint, streamName});
 * // we get the media stream from server
 * connection.onOpen = stream => videoElement.srcObject = stream;
 *
 * // Streamer channel (with initial 'stream' parameter), sends and receives media streams
 * const connection = new HTTPConnector({endPoint, streamName}, {stream: await navigator.mediaDevices.getUserMedia()});
 * // the media stream here is our local camera as passed in the above constructor
 * connection.onOpen = stream => {}
 */
export class HTTPConnector extends SIPConnector {
    private _fetch: AbortController;
    private _url: URL;

    /**
     * Start the HTTPConnector.
     *
     * By default, a listener channel is negotiated.
     * To create a streamer channel, give a media stream parameter
     */
    constructor(connectParams: Connect.Params, stream?: MediaStream) {
        super(connectParams, stream);
        this._url = Connect.buildURL(Connect.Type.WEBRTC, connectParams, 'https');
        this._fetch = new AbortController();
        // [ENG-142] Add a way to get the server's configuration for 'iceServers'
        setTimeout(() => {
            // We wait for the next event loop to let the user set the event handlers because it can be closed immediately
            this._open(connectParams.iceServer);
        }, 0);
    }

    /**
     * @override{@inheritDoc SIPConnector.close}
     */
    close(error?: string) {
        this._fetch.abort();
        super.close(error);
    }

    /**
     * @override{@inheritDoc SIPConnector._sip}
     */
    protected async _sip(offer: string): Promise<string> {
        const response = await fetch(this._url, {
            method: 'POST',
            body: offer,
            headers: {
                'Content-Type': 'application/sdp'
            },
            signal: this._fetch.signal
        });
        return response && response.ok ? response.text() : Promise.reject('client rejected');
    }
}
