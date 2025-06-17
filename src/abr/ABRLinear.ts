/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MediaReport } from '../connectors/IController';
import { Util } from '@ceeblue/web-utils';
import { ABRAbstract, ABRParams } from './ABRAbstract';

class Vars {
    stableTime: number = 0;
    stableBitrate: number = 0;
    lastLoss: number = Number.POSITIVE_INFINITY;
    constructor(public recoverySteps: number) {}
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
        // Set initial recoverySteps to the value configured minus 1
        // to cancel the first incrementation (see ++vars.recoverySteps )
        this._vars = new Vars(this.recoverySteps - 1);
    }

    /**
     * @override
     */
    reset() {
        super.reset();
        this._vars = new Vars(this.recoverySteps - 1);
    }

    /**
     * Compute ideal bitrate regarding current bitrate, bitrateConstraint and loss infos in mediaReport
     * @override{@inheritDoc ABRAbstract._computeBitrate}
     */
    protected _computeBitrate(bitrate: number, bitrateConstraint?: number, mediaReport?: MediaReport): number {
        // this.log({
        //     bitrate,
        //     bitrateConstraint,
        //     lost: mediaReport && mediaReport.stats && mediaReport.stats.loss_perc,
        //     recoverySteps: this._vars.recoverySteps,
        //     stableTime: this._vars.stableTime,
        //     stableBitrate: this._vars.stableBitrate
        // }).info();

        const stats = mediaReport && mediaReport.stats;
        const vars = this._vars;

        if (bitrateConstraint && bitrate > bitrateConstraint) {
            // BitrateConstraint reached!
            // Decrease bitrate to listen server advisement
            vars.stableTime = 0;
            bitrate = bitrateConstraint;
        } else if (stats && stats.loss_perc) {
            // Loss few packets, decrease bitrate!
            if (stats.loss_perc >= vars.lastLoss) {
                // lost => decrease bitrate
                bitrate = Math.round((1 - stats.loss_perc / 100) * bitrate);
            }
            vars.stableTime = 0;
            vars.lastLoss = stats.loss_perc;
        } else {
            // Network OK => Search stability close to videoBitrateMax
            vars.lastLoss = Number.POSITIVE_INFINITY;
            const now = Util.time();
            if (now >= vars.stableTime) {
                if (vars.stableTime) {
                    // Stable => try to increase
                    this._updateVideoConstraints(bitrate);
                    bitrate += Math.ceil((this.maximum - vars.stableBitrate) / vars.recoverySteps);
                    // restore recovery steps to its initial value
                    vars.recoverySteps = Math.max(vars.recoverySteps - 1, this.recoverySteps);
                } else {
                    // After a congestion (or the first time)
                    // => store stable bitrate
                    // => increase recoverySteps
                    vars.stableBitrate = bitrate;
                    ++vars.recoverySteps;
                }
                vars.stableTime = now + this.appreciationDuration;
            }
        }
        return bitrate;
    }
}
