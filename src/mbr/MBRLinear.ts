/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MTrack, MType } from '../metadata/Metadata';
import { Util } from '@ceeblue/web-utils';
import { MBRAbstract, MBRParams } from './MBRAbstract';

/**
 * MBRLinear is a multi-bitrate algorithm by implementing {@link MBRLinear} that switches between tracks
 * quality depending on the network's congestion which is evaluated using the gradiant from the number
 * of lost packets and the number of NACK received.
 *
 * In addition before to evaluate the network quality as good it waits to get a full GOP size of frames for video.
 */
export class MBRLinear extends MBRAbstract {
    private _lost: number;
    private _nackCount: number;
    private _keyFramesDecoded: number;
    /**
     * @override{@inheritDoc MBRAbstract.constructor}
     */
    constructor(params: MBRParams) {
        super(params);
        this._keyFramesDecoded = 0;
        this._lost = 0;
        this._nackCount = 0;
    }

    /**
     * @override{@inheritDoc MBRAbstract._downBitrate}
     */
    protected _downBitrate(elapsed: number, trackRef: MTrack, stats: RTCInboundRtpStreamStats): boolean {
        const lost = stats.packetsLost;
        const nack = stats.nackCount;
        if (lost == null) {
            this.log('No packetsLost information in ' + Util.stringify(stats)).warn();
            return false; // can't compute congestion!
        }
        // Lost increasing?
        // NACK is used to check that it's really a congestion, and not a user track change
        const congested = elapsed > 0 && lost > this._lost && (nack ? nack > this._nackCount : true);
        //console.log('DOWN', elapsed, this._lost, lost, 'nack=' +stats.nackCount);
        this._lost = lost;
        this._nackCount = nack || 0;
        return congested;
    }

    /**
     * @override{@inheritDoc MBRAbstract._downBitrate}
     */
    protected _upBitrate(elapsed: number, trackRef: MTrack, stats: RTCInboundRtpStreamStats): boolean {
        if (trackRef.type === MType.AUDIO) {
            return true;
        } // audio track can always be up!
        // Waits a full GOP size, or 10 seconds (max GOP Size)
        if (elapsed > 10000) {
            return true;
        }
        const keyFramesDecoded = stats.keyFramesDecoded;
        if (keyFramesDecoded == null) {
            return false;
        } // can't compute GOP size, waits max GOP Size!
        if (!elapsed) {
            // First UP
            this._keyFramesDecoded = keyFramesDecoded;
        } else if (keyFramesDecoded > this._keyFramesDecoded) {
            // now we have gotten at least one new key frame, wait next call to confirm no lost!
            if (!this._keyFramesDecoded) {
                return true;
            }
            this._keyFramesDecoded = 0;
        }
        //console.log('UP', elapsed, this._keyFramesDecoded, keyFramesDecoded);
        return false;
    }
}
