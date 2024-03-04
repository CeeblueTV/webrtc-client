/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { MTrack, Metadata } from '../metadata/Metadata';
import { ILog, Util } from '@ceeblue/web-utils';

const LEARNING_UP_STEP = 1400;
const MAXIMUM_UP_DELAY = 28000;

/**
 * MBRParams is the structure used to initialize an {@link MBRAbstract} instance.
 */
export type MBRParams = {
    /**
     * Number of milliseconds to increase the delay of the next Up try when we are congested
     * @defaultValue 1400
     */
    learningUpStep?: number;
    /**
     * Maximum delay in milliseconds to wait before trying to Up again
     * @defaultValue 28000
     */
    maximumUpDelay?: number;
};

/**
 * MBRAbstract is the base class for multi-bitrate algorithm used by {@link Player}
 * to switch between tracks quality depending on the network's congestion.
 */
export abstract class MBRAbstract implements MBRParams, ILog {
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
     * delay before to increase bitrate when network quality is good
     */
    get upDelay(): number {
        return this._upDelay;
    }
    /**
     * delay added on every congestion to report next bitrate increasing
     */
    get learningUpStep(): number {
        return this._learningUpStep;
    }
    /**
     * maximum delay before to increase bitrate when network quality is good
     */
    get maximumUpDelay(): number {
        return this._maximumUpDelay;
    }

    private _mTrack?: MTrack;
    private _learningUpStep: number;
    private _upDelay: number;
    private _maximumUpDelay: number;
    private _testTime: number;
    private _appreciationTime?: number;

    /**
     * Build the MBR implementation, call {@link compute} to use it
     * @param params MBR parameters
     */
    constructor(params: MBRParams) {
        const init = Object.assign(
            {
                learningUpStep: LEARNING_UP_STEP,
                maximumUpDelay: MAXIMUM_UP_DELAY
            },
            params
        );
        this._learningUpStep = init.learningUpStep;
        this._maximumUpDelay = init.maximumUpDelay;
        this._upDelay = 0;
        this._testTime = 0;
    }

    /**
     * Reset the MBR algorithm to its initial state
     */
    reset() {
        this._upDelay = 0;
        this._mTrack = undefined;
    }

    /**
     * Call this method regularly to control if we have to change track, it will update
     * the tracks if needed and return true if a track has changed.
     * @param metadata Metadata of the stream
     * @param tracks the audio and video track number, this object can be updated with the new track numbers
     * @param stats Statistics to use to determine if we have to decrease bitrate now
     * @returns true if a track has changed, false otherwise
     */
    compute(
        metadata: Metadata,
        tracks: { audio?: number; video?: number },
        stats: { audio?: RTCInboundRtpStreamStats; video?: RTCInboundRtpStreamStats }
    ): boolean {
        // Always use video track as reference to compute congestion: video is much more impacted by congestion
        const track = tracks.video ?? tracks.audio;
        if (track == null) {
            this._mTrack = undefined; // reset for next time!
            return false; // disabled
        }

        const now = Util.time();
        if (!this._mTrack || this._mTrack.idx !== track) {
            // New track or track has changed
            this._appreciationTime = undefined;
            this._testTime = now;

            this._mTrack = metadata.tracks.get(track);
            if (!this._mTrack) {
                this.onError("Can't find track " + track + ' absent from metadata');
                return false;
            }
        }

        const trackStats = track === tracks.video ? stats.video : stats.audio;
        if (!trackStats) {
            this.onError("Can't compute " + this._mTrack.type + ' track ' + this._mTrack.idx + ' without statistics');
            return false;
        }

        const down = this._downBitrate(now - this._testTime, this._mTrack, trackStats);
        if (down) {
            // NOK
            this._appreciationTime = undefined; // reset appreciation time on any congestion!
        } else {
            // OK
            if (!this._appreciationTime) {
                // First correct appreciation
                this._appreciationTime = now;
            }
            const elapsed = now - this._appreciationTime;
            if (!this._upBitrate(elapsed, this._mTrack, trackStats) || elapsed < this._upDelay) {
                return false;
            }
        }

        // Compute new track => In first tries to change Audio track, then Video track
        let mTrack = this.updateTrack(tracks.audio, metadata, down);
        if (!mTrack) {
            mTrack = this.updateTrack(tracks.video, metadata, down);
            if (!mTrack) {
                return false;
            } // MAX UP or DOWN => no change!
            tracks.video = mTrack.idx;
        } else {
            tracks.audio = mTrack.idx;
        }
        if (down) {
            // CONGESTED! => increase delay to up again!
            this._upDelay = Math.min(this._upDelay + this._learningUpStep, this._maximumUpDelay);
        }
        this.onLog(
            (down ? 'DOWN' : 'UP') +
                ' from ' +
                this._mTrack.type +
                ' track ' +
                this._mTrack.idx +
                ' (' +
                this._mTrack.maxbps +
                'bps) to ' +
                mTrack.type +
                ' track ' +
                mTrack.idx +
                ' (' +
                mTrack.maxbps +
                'bps)'
        );
        return true;
    }

    /**
     * Try to select the next track to use if available
     * @param track the track number to update
     * @param metadata the metadata of the stream
     * @param down True if it is a down change, false if it is an up change
     * @returns the new track to use or undefined if no change is possible
     */
    private updateTrack(track: number | undefined, metadata: Metadata, down: boolean): MTrack | undefined {
        if (track == null) {
            return;
        } // disabled!
        const direction = down ? 'down' : 'up';
        const mTrack = metadata.tracks.get(track);
        if (mTrack) {
            return mTrack[direction];
        }
        this.onError("Can't find track " + track + ' from metadata');
    }

    /**
     * Check if we are congested and need to reduce the bitrate now
     * Implement this method to define your own congestion algorithm
     *
     * @param elapsed Time since beginning of congestion, on a new state 'elapsed' is equals to 0 on first call
     * @param trackRef Track used as reference for statistics, is always the video track playing excepting if the stream is a pure audio stream
     * @param stats Statistics to use to determine if we have to decrease bitrate now
     * @returns true if we can decrease bitrate quality now
     */
    protected abstract _downBitrate(elapsed: number, trackRef: MTrack, stats: RTCInboundRtpStreamStats): boolean;
    /**
     * Called when {@link _downBitrate} returns false to check if we can increase the bitrate now
     * Implement this method to define your own congestion algorithm
     *
     * @param elapsed Time since beginning of good network state, on the first call 'elapsed' is equals to 0
     * @param trackRef Track used as reference for statistics, is always the video track playing excepting if the stream is a pure audio stream
     * @param stats Statistics to use to determine if we have to increase bitrate now
     * @returns true if we can increase bitrate quality now
     */
    protected abstract _upBitrate(elapsed: number, trackRef: MTrack, stats: RTCInboundRtpStreamStats): boolean;
}
