/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */
import { NetAddress } from './NetAddress';

/**
 * Parameters of connections
 */
export type ConnectParams = {
    /**
     * Host to connect. Can include port, and accept also an url format with port and path,
     * it can help to force a path OR try to give a protocol preference
     */
    host: string;
    /**
     * The name of the stream to join
     */
    streamName: string;
    /**
     * Optional access token to use to join a private stream
     */
    accessToken?: string;
    /**
     * iceServer to use while connecting to a WebRTC stream
     */
    iceServer?: RTCIceServer; // Authentication value
    /**
     * Optional query to add into the generated url of connection
     */
    query?: Record<string, string>;
};

/**
 * Type of connection
 */
export enum ConnectType {
    WEBRTC = 'webrtc',
    META = 'meta',
    DATA = 'data'
}

/**
 * Some connection utility functions
 */
export const Connect = {
    /**
     * Build an URL from {@link ConnectType | connectType} and {@link ConnectParams | connectParams}
     * @param connectType Type of the connection wanted
     * @param connectParams Connection parameters
     * @param protocol Optional parameter to choose the prefered protocol to connect
     * @returns The URL of connection
     */
    buildURL(connectType: ConnectType, connectParams: ConnectParams, protocol: string = 'wss'): URL {
        const url = new URL(NetAddress.fixProtocol(protocol, connectParams.host));
        if (url.pathname.length <= 1) {
            // build ceeblue path!
            switch (connectType) {
                case ConnectType.WEBRTC:
                    url.pathname = '/webrtc/' + connectParams.streamName;
                    break;
                case ConnectType.META:
                    url.pathname = '/json_' + connectParams.streamName + '.js';
                    break;
                case ConnectType.DATA:
                    url.pathname = '/' + connectParams.streamName + '.json';
                    break;
                default:
                    console.warn('Unknown url type ' + connectType);
                    break;
            }
        } // Host has already a path! keep it unchanged, it's user intentionnal (used with some other WHIP/WHEP server?)
        if (connectParams.accessToken) {
            url.searchParams.set('id', connectParams.accessToken);
        }
        for (const key in connectParams.query) {
            url.searchParams.set(key, connectParams.query[key]);
        }
        return url;
    }
};
Object.freeze(Connect);
