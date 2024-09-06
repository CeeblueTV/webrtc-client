/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MediaReport } from '../connectors/IController';
import { Util, Numbers } from '@ceeblue/web-utils';
import { ABRAbstract, ABRParams } from './ABRAbstract';

const BITRATE_RECOVERY_MIN_TIMEOUT = 2500;
const BITRATE_RECOVERY_MAX_TIMEOUT = 60 * 1000;

class Vars {
    lossPercents: Numbers = new Numbers(5);
    stableBitrates: Numbers = new Numbers(15);
    stableBitrateUpdateTime: number = 0;
    bitrateRecoveryTimeout: number = 10000;
    bitrateRecoveryNextTime: number = 0;
    bitrateRecoveryTime?: number;
    bitrateConstraintTime?: number;
}

/**
 * ABRGrade is an adaptive bitrate algorithm implementing {@link ABRAbstract}
 * that uses current bitrate, bitrateConstraint, loss infos of mediaReport
 * and some level constants to adapt the bitrate in a robust way
 */
export class ABRGrade extends ABRAbstract {
    private _vars: Vars;
    /**
     * @override{@inheritDoc ABRAbstract.constructor}
     */
    constructor(params: ABRParams, stream?: MediaStream) {
        super(params, stream);
        this._vars = new Vars();
    }

    /**
     * @override{@inheritDoc ABRAbstract.reset}
     */
    reset() {
        // reset!
        super.reset();
        this._vars = new Vars();
    }

    /**
     * @override {@inheritDoc ABRAbstract._computeBitrate}
     */
    protected _computeBitrate(bitrate: number, bitrateConstraint?: number, mediaReport?: MediaReport): number {
        const vars = this._vars;
        const stats = mediaReport && mediaReport.stats;
        if (stats && stats.loss_perc != null) {
            vars.lossPercents.push(stats.loss_perc);
        }

        // Update video bitrate metrics every 4 seconds
        const now = Util.time();
        if (now >= vars.stableBitrateUpdateTime) {
            // Update metrics if average loss percentage is less than 20%
            if (vars.lossPercents.average < 0.2) {
                vars.stableBitrateUpdateTime = now + 4000;
                vars.stableBitrates.push(Math.min(bitrateConstraint ?? this.constraint ?? 0, bitrate, this.maximum));
            }
        }

        const stableBitrate = vars.stableBitrates.average;
        const stableBitrateMin = vars.stableBitrates.minimum;
        const stableBitrateMax = vars.stableBitrates.maximum;
        // this._logger.log(`[${this._formatBitrate(stableVideoBitrate * 0.8)}> ${this._formatBitrate(stableVideoBitrateMin)}...${this._formatBitrate(stableVideoBitrateMax)} <${this._formatBitrate(stableVideoBitrate * 1.2)}] ${this._formatBitrate(stableVideoBitrate)}`);
        // When bitrate is stable (+-20%), then try to change camera constraints
        if (stableBitrateMin >= stableBitrate * 0.8 && stableBitrateMax <= stableBitrate * 1.2) {
            this._updateVideoConstraints(stableBitrate);
        }

        // If constraint decreased
        if (bitrateConstraint != null && this.constraint != null && bitrateConstraint < this.constraint) {
            this._logger.log(`onVideoBitrateConstraint: ${this._formatBitrate(bitrateConstraint - this.constraint)}`);

            // If it is first constraint
            if (!vars.bitrateConstraintTime) {
                if (!vars.bitrateRecoveryTime) {
                    this._logger.log('VideoBitrateConstraint: First constrain! Halve bitrate!');

                    // Reduce the target video bitrate
                    bitrate = Math.round(bitrate / 2);
                }
            } else if (vars.bitrateRecoveryTime) {
                const recoveryDuration = now - vars.bitrateRecoveryTime;

                // Increase recovery timeout
                if (
                    recoveryDuration < vars.bitrateRecoveryTimeout ||
                    vars.bitrateRecoveryTimeout === BITRATE_RECOVERY_MIN_TIMEOUT
                ) {
                    this._increaseRecoveryTimeout();
                    vars.bitrateRecoveryTime = undefined;
                }
            }

            vars.bitrateConstraintTime = now;
        }

        // videoBitrateConstraint
        if (bitrateConstraint) {
            if (bitrateConstraint < this.minimum) {
                bitrate = this.minimum;
            }

            if (this.maximum > bitrateConstraint && now >= vars.bitrateRecoveryNextTime) {
                const newBitrate = vars.bitrateRecoveryNextTime && this._bitrateRecoveryHandler(bitrateConstraint);
                if (!newBitrate) {
                    // reprogram timer!
                    vars.bitrateRecoveryNextTime = now + vars.bitrateRecoveryTimeout;
                    this._logger.log('startVideoBitrateRecoveryTimer ' + vars.bitrateRecoveryTimeout);
                } else {
                    // stop timer, done!
                    vars.bitrateRecoveryTimeout = now;
                    vars.bitrateRecoveryNextTime = 0;
                    bitrate = newBitrate;
                }
            }
        }
        return bitrate;
    }

    private _bitrateRecoveryHandler(bitrateConstraint: number): number | undefined {
        const vars = this._vars;
        const lossAvg = vars.lossPercents.average;

        this._logger.log('videoBitrateRecoveryHandler loss: ' + lossAvg.toFixed(2));
        if (lossAvg < 0.2) {
            let bitrate = this._increaseTargetBitrate(bitrateConstraint);
            if (vars.bitrateConstraintTime && bitrate > vars.stableBitrates.average) {
                bitrate = this._increaseTargetBitrate(bitrateConstraint, 1.005);
            }

            // Decrease recovery timeout
            this._decreaseRecoveryTimeout();

            this._logger.log('videoBitrateRecoveryHandler increase bitrate to ' + this._formatBitrate(bitrate));
            return bitrate;
        }
        if (lossAvg < 5.0) {
            this._increaseRecoveryTimeout();

            const bitrate = this._decreaseTargetBitrate(bitrateConstraint);
            this._logger.log('videoBitrateRecoveryHandler decrease bitrate to ' + this._formatBitrate(bitrate));
            return bitrate;
        }
    }

    private _increaseTargetBitrate(bitrateConstraint: number, factor: number = 1.05): number {
        let bitrate = Math.round(bitrateConstraint * factor);
        if (bitrate > this.maximum) {
            bitrate = this.maximum;
        }
        return bitrate;
    }

    private _decreaseTargetBitrate(bitrateConstraint: number): number {
        let bitrate = Math.round(bitrateConstraint * 0.99);
        if (bitrate < this.minimum) {
            bitrate = this.minimum;
        }
        return bitrate;
    }

    private _increaseRecoveryTimeout() {
        this._vars.bitrateRecoveryTimeout = Math.min(
            BITRATE_RECOVERY_MAX_TIMEOUT,
            2 * this._vars.bitrateRecoveryTimeout
        );
    }

    private _decreaseRecoveryTimeout() {
        this._vars.bitrateRecoveryTimeout = Math.max(
            BITRATE_RECOVERY_MIN_TIMEOUT,
            Math.round(0.75 * this._vars.bitrateRecoveryTimeout)
        );
    }

    private _formatBitrate(value: number): string {
        return (value / 1000000).toFixed(3);
    }
}
