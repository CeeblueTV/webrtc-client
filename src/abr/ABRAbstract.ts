/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MediaReport } from '../connectors/IController';
import { EventEmitter } from '@ceeblue/web-utils';

const HD_Pixels = 1280 * 720;
const HD_Bitrate = 1.2 * 1000000;

/**
 * ABRParams is the structure used to initialize an {@link ABRAbstract} instance.
 */
export type ABRParams = {
    /**
     * Startup bitrate in bps
     * @defaultValue 2000000
     */
    startup?: number;
    /**
     * Minimum bitrate in bps
     * @defaultValue 200000
     */
    minimum?: number;
    /**
     * Maximum bitrate in bps
     * @defaultValue 3000000
     */
    maximum?: number;
    /**
     * The `recoveryFactor` parameter defines the step size used to gradually restore the bitrate
     * towards the ideal bandwidth, aiming to approach the {@link ABRParams.maximum} limit.
     *
     * Initially set to the configured value (default: 2), this factor determines the number of steps
     * taken to adapt the bitrate based on network conditions :
     * - If network congestion is detected, the step count increases to avoid overshooting.
     * - Once the network stabilizes, the step count decreases, returning gradually to its initial value.
     *
     * In essence, `recoveryFactor` controls the initial speed at which the system recovers a high transfer rate.
     *
     * @warning Only used by ABRLinear
     * @defaultValue 2
     */
    recoveryFactoer?: number;
};

/**
 * ABRAbstract is the base class for adaptive bitrate algorithm used by {@link Streamer}
 * when it has a controller connector.
 */
export abstract class ABRAbstract extends EventEmitter implements ABRParams {
    /**
     * Get the configured initial bitrate
     */
    get startup(): number {
        return this._startup;
    }

    /**
     * Update the initial bitrate
     */
    set startup(value: number) {
        this._startup = Math.max(this._minimum, Math.min(Math.round(value), this._maximum));
    }

    /**
     * Get the minimum bitrate
     */
    get minimum(): number {
        return this._minimum;
    }

    /**
     * Update the minimum bitrate
     */
    set minimum(value: number) {
        value = Math.round(value);
        if ((this._minimum = value) > this._maximum) {
            this._maximum = this._startup = value;
        } else if (this._startup < value) {
            this._startup = value;
        }
    }

    /**
     * Get the maximum bitrate
     */
    get maximum(): number {
        return this._maximum;
    }

    /**
     * Update the maximum bitrate
     */
    set maximum(value: number) {
        value = Math.round(value);
        if ((this._maximum = value) < this._minimum) {
            this._minimum = this._startup = value;
        } else if (this._startup > value) {
            this._startup = value;
        }
    }

    /**
     * Get the current bitrate constraint
     */
    get constraint(): number | undefined {
        return this._bitrateConstraint;
    }

    /**
     * Get recovery factor
     */
    get recoveryFactor(): number {
        return this._recoveryFactor;
    }

    /**
     * Set recovery factor
     */
    set recoveryFactor(value: number) {
        this._recoveryFactor = value;
    }

    /**
     * Get the current bitrate
     */
    get value(): number | undefined {
        return this._bitrate;
    }

    /**
     * @returns the current bitrate
     * @override
     */
    valueOf(): number | undefined {
        return this.value;
    }

    /**
     * Get the {@link https://developer.mozilla.org/docs/Web/API/MediaStream MediaStream} if set
     */
    get stream(): MediaStream | undefined {
        return this._stream;
    }

    private _bitrateConstraint?: number;
    private _bitrate?: number;
    private _startup: number;
    private _maximum: number;
    private _minimum: number;
    private _recoveryFactor: number;
    private _stream?: MediaStream;
    /**
     * Build the ABR implementation, call {@link compute} to use it
     * @param params ABR parameters
     * @param stream If set it can change dynamically the source resolution regarding the network quality
     */
    constructor(params: ABRParams, stream?: MediaStream) {
        super();
        const init = Object.assign(
            {
                startup: 2000000, // Default 2Mbps
                maximum: 3000000, // Default 3Mbps
                minimum: 200000, // Default 200Kbps
                recoveryFactor: 2 // Default 2
            },
            params
        );
        this._startup = init.startup;
        this._minimum = init.minimum;
        this._maximum = init.maximum;
        this._recoveryFactor = init.recoveryFactor;
        this._stream = stream;
    }

    /**
     * Call this method regularly to control if we have to increase or decrease the stream bitrate
     * depending on the network conditions.
     * @param bitrate the current bitrate
     * @param bitrateConstraint the current bitrate constraint
     * @param mediaReport the media report structure received from the server
     * @returns the wanted bitrate or undefined to not change the current bitrate
     */
    compute(bitrate: number | undefined, bitrateConstraint?: number, mediaReport?: MediaReport): number | undefined {
        if (bitrate == null) {
            return (this._bitrate = bitrate);
        } // disabled (reset _bitrate)
        const firstTime = this._bitrate == null;
        // compute required bitrate
        const newBitrate = firstTime
            ? this.startup
            : Math.max(
                  this.minimum,
                  Math.min(this._computeBitrate(bitrate, bitrateConstraint, mediaReport), this.maximum)
              );
        // assign current bitrate
        this._bitrate = bitrate;
        this._bitrateConstraint = bitrateConstraint;
        // log changes
        if (firstTime) {
            this.log(`Set startup bitrate to ${newBitrate}`).info();
        } else if (newBitrate > bitrate) {
            this.log(`Increase bitrate ${bitrate} => ${newBitrate}`).info();
        } else if (newBitrate < bitrate) {
            this.log(`Decrease bitrate ${bitrate} => ${newBitrate}`).info();
        }
        return newBitrate;
    }

    /**
     * Reset the ABR algorithm to its initial state
     */
    reset() {
        this._bitrate = this._bitrateConstraint = undefined;
    }

    /**
     * Implement this method to define your own congestion algorithm, the method must
     * return the wanted bitrate or undefined to not change the current bitrate.
     * @param bitrate the current bitrate
     * @param bitrateConstraint the current bitrate constraint
     * @param mediaReport the media report structure received from the server
     * @returns the wanted bitrate or undefined to not change the current bitrate
     */
    protected abstract _computeBitrate(bitrate: number, bitrateConstraint?: number, mediaReport?: MediaReport): number;

    protected _updateVideoConstraints(videoBitrate: number) {
        const stream = this._stream;
        if (!stream) {
            return;
        }
        const track = stream.getVideoTracks()[0];
        if (!track) {
            return;
        }
        const settings = track.getSettings();
        if (!settings.width || !settings.height) {
            return;
        }

        const pixels = settings.width * settings.height;
        if (videoBitrate >= HD_Bitrate) {
            if (pixels < HD_Pixels * 0.7) {
                // increase resolution
                this._upgradeVideoConstraint(track, 2.0);
            }
        } else if (pixels > HD_Pixels * 0.7 && pixels < HD_Pixels * 1.3) {
            // decrease resolution
            this._upgradeVideoConstraint(track, 0.5);
        }
    }

    private _upgradeVideoConstraint(track: MediaStreamTrack, factor: number) {
        const constraint: { width?: number; height?: number } = {};
        const cameraWidth = track.getSettings().width;
        if (cameraWidth != null) {
            constraint.width = cameraWidth * factor;
        }
        const cameraHeight = track.getSettings().height;
        if (cameraHeight != null) {
            constraint.height = cameraHeight * factor;
        }

        this.log(`Resolution change ${cameraWidth}X${cameraHeight} => ${constraint.width}X${constraint.height}`).info();
        track.applyConstraints(constraint);
    }
}
