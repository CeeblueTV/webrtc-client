/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { PlayerStats } from '../../dist/webrtc-client.js';

export function readableBitrate(bytes) {
    if (bytes === 0) {
        return '';
    }
    const i = Math.floor(Math.log(bytes) / Math.log(1000));
    const sizes = ['bps', 'kbps', 'mbps', 'gbps'];
    return (bytes / Math.pow(1000, i)).toFixed(1) + ' ' + sizes[i];
}

/**
 * ErrorStats implements the {@link IStats} interface
 * to send error messages to the telemetry server
 * 
 * Known errors are:
 *   StreamMetadata: Stream is offline
 *   Signaling: <stream URL> disconnection (1006)
 *   Signaling: client rejected
 *   StreamMetadata: Stream is waiting for data
 */
export class ErrorStats {
    constructor(error, sessionId) {
        this._error = error;
        this._sessionId = sessionId;
    }

    async serialize(){
        return {
            sessionId: this._sessionId,
            timestamp: this.timestamp,
            currentTime: Date(),
            error: this._error
        }
    }
}

/**
 * CustomStats overrides the statistics serialization of PlayerStats
 * to send custom statistics to the telemetry server
 * 
 * It includes the quality of the current video stream and the duration of this quality since last call
 */
export class CustomStats extends PlayerStats {
    get sessionId() { return this._sessionId;}

    constructor(player) {
        super(player);
        this._prevTime = 0;
        this._sessionId = undefined;
        this._videoTracks = new Map();
        this._prevVideoTrackId = undefined;
        this._trackChange = null;

        player.on('metadata', (metadata) => {
            this._videoTracks = new Map();

            for (const [id, track] of metadata.tracks) {
                if (track.type === 'video') {
                    this._videoTracks.set(
                        id,
                        `${track.codec} ${track.width}x${track.height} ${readableBitrate(track.bps * 8)}`
                    );
                }
            }
        });
    }

    setTrackChange(reason) {
        this._trackChange = reason;
    }

    async serialize(){
        const metrics = await super.serialize();
        
        const now = Date.now();
        const newMetrics = {
            sessionId: this._sessionId = metrics.sessionId,
            currentTime: Date(now),

            roundTripTime: metrics.currentRoundTripTime,
            bytesReceived: metrics.bytesReceived,
            incomingBitrate: metrics.incomingBitrate,
            availableIncomingBitrate: metrics.availableIncomingBitrate,

            packetsLost: 0,
            nackCount: 0,
            jitter: 0,
            pliCount: 0,
            framesDropped: 0,

            videoQuality: this._videoTracks.get(metrics.videoTrack),
            qualityDuration: this._prevTime ? now - this._prevTime : 0, // Time since last call
        }
        
        // Track change event
        if (this._trackChange) {
            newMetrics.oldTrack = this._videoTracks.get(this._prevVideoTrackId);
            newMetrics.trackChange = this._trackChange;
            console.log("Track change from ", newMetrics.oldTrack, " to ", newMetrics.videoQuality, " reason: ", newMetrics.trackChange);
            this._trackChange = null;
        }
        this._prevVideoTrackId = metrics.videoTrack;

        if (metrics.audio) {
            newMetrics.jitter += metrics.audio.jitter;
            newMetrics.packetsLost += metrics.audio.packetsLost;
            newMetrics.nackCount += metrics.audio.nackCount;
        }
        if (metrics.video) {
            newMetrics.jitter += metrics.video.jitter;
            newMetrics.packetsLost += metrics.video.packetsLost;
            newMetrics.nackCount += metrics.video.nackCount;
            newMetrics.pliCount = metrics.video.pliCount;
            newMetrics.framesDropped = metrics.video.framesDropped;
        }

        // Save for next call
        this._prevTime = now;
        return newMetrics;
    }
}
