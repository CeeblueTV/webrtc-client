/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MediaReport } from '../connectors/IController';
import { Util } from '@ceeblue/web-utils';
import { ABRAbstract, ABRParams } from './ABRAbstract';

const STABLE_TIMEOUT = 11; // > 10 sec = maximum window between 2 key frames
class Vars {
    stableTime: number = 0;
    stableBitrate: number = 0;
    attempts: number = 1;
    lastLoss: number = Number.POSITIVE_INFINITY;
}

/**
 * ABRLinear is an adaptive bitrate algorithm implementing {@link ABRAbstract}
 * that uses current bitrate and loss infos in mediaReport to adapt in real-time the bitrate
 */
export class ABRLinear extends ABRAbstract {
    private _vars: Vars;
    /**
     * @override{@inheritDoc ABRAbstract.constructor}
     */
    constructor(params: ABRParams, stream?: MediaStream) {
        super(params, stream);
        this._vars = new Vars();
    }

    /**
     * @override
     */
    reset() {
        super.reset();
        this._vars = new Vars();
    }

    /**
     * Compute ideal bitrate regarding current bitrate, bitrateConstraint and loss infos in mediaReport
     * @override{@inheritDoc ABRAbstract._computeBitrate}
     */
    protected _computeBitrate(bitrate: number, bitrateConstraint?: number, mediaReport?: MediaReport): number {
        /*this.log({
			bitrate,
			lost:mediaReport && mediaReport.stats && mediaReport.stats.loss_perc,
			attempts: this._attempts,
			stableTime: this._stableTime,
			stableVideoBitrate: this._stableVideoBitrate
		}).info();*/

        const stats = mediaReport && mediaReport.stats;
        const vars = this._vars;
        if (stats && stats.loss_perc) {
            if (stats.loss_perc >= vars.lastLoss) {
                // lost => decrease bitrate
                //	- decrease recoveryFactor
                if (vars.stableTime) {
                    ++vars.attempts;
                }
                vars.stableTime = 0;
                bitrate = Math.round((1 - stats.loss_perc / 100) * bitrate);
            }
            vars.lastLoss = stats.loss_perc;
        } else {
            vars.lastLoss = Number.POSITIVE_INFINITY;
            // Search stability close to videoBitrateMax
            const now = Util.time();
            if (now >= vars.stableTime) {
                if (vars.stableTime) {
                    // Stable => try to increase
                    this._updateVideoConstraints(bitrate);
                    bitrate += Math.ceil((this.maximum - vars.stableBitrate) / vars.attempts);
                } else {
                    vars.stableBitrate = bitrate;
                }
                vars.stableTime = now + STABLE_TIMEOUT;
            }
        }
        return bitrate;
    }
}
