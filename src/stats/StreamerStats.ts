/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Streamer } from '../Streamer';
import { ILog } from '../utils/ILog';
import { Util } from '../utils/Util';
import { EventEmitter } from '../utils/EventEmitter';
import { IStats } from './IStats';

/**
 * StreamerStats implements the statistics serialization for a {@link Streamer} instance.
 */
export class StreamerStats extends EventEmitter implements IStats, ILog {
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
     * @override{@inheritDoc IStats.onRelease}
     * @event
     */
    onRelease() {}

    private _streamer: Streamer;
    private _lastBytesSend: number;
    private _lastBytesSendTime: number;
    /**
     * Build a StreamerStats instance to report streamer stats
     * @param streamer streamer instance
     */
    constructor(streamer: Streamer) {
        super();
        this._streamer = streamer;
        this._lastBytesSend = 0;
        this._lastBytesSendTime = Date.now();
        streamer.once('stop', () => this.onRelease());
    }

    /**
     * Return streamer stats into a Object representation
     * @override
     */
    async serialize(): Promise<object> {
        if (!this._streamer.running) {
            return Promise.reject();
        }
        // Main info
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metrics: any = {
            streamId: this._streamer.streamName,
            vbt: this._streamer.videoBitrate, // Video bitrate target
            vbc: this._streamer.videoBitrateConstraint // Video bitrate constraint
        };

        // Media report info
        const mediaReport = this._streamer.mediaReport;
        if (mediaReport) {
            metrics.server = {
                millis: mediaReport.millis,
                tracks: mediaReport.tracks
            };
            if (mediaReport.stats) {
                metrics.server.jitterMs = mediaReport.stats.jitter_ms;
                metrics.server.lossNum = mediaReport.stats.loss_num;
                metrics.server.lossPerc = mediaReport.stats.loss_perc;
                metrics.server.nackNum = mediaReport.stats.nack_num;
            }
        }

        let connectionInfos;
        try {
            connectionInfos = await this._streamer.connectionInfos();
        } catch (e) {
            this.onLog('Report stats without connection infos, ' + Util.stringify(e));
            return metrics;
        }

        const candidate = connectionInfos.candidate;
        if (candidate) {
            metrics.sessionId = candidate.id;
            metrics.timestamp = candidate.timestamp;

            // https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats

            metrics.currentRoundTripTime = candidate.currentRoundTripTime;
            metrics.totalRoundTripTime = candidate.totalRoundTripTime;

            metrics.requestsReceived = candidate.requestsReceived;
            metrics.requestsSent = candidate.requestsSent;
            metrics.responsesReceived = candidate.responsesReceived;
            metrics.responsesSent = candidate.responsesSent;

            metrics.bytesSent = candidate.bytesSent;
            metrics.bytesReceived = candidate.bytesReceived;

            if (candidate.availableOutgoingBitrate == null) {
                const diff = metrics.bytesSent - this._lastBytesSend;
                this._lastBytesSend = metrics.bytesSent;

                const now = Date.now();
                const duration = (now - this._lastBytesSendTime) / 1000;
                this._lastBytesSendTime = now;

                candidate.availableOutgoingBitrate = (diff * 8) / duration;
            }
            metrics.availableOutgoingBitrate = candidate.availableOutgoingBitrate;
        }

        const audio = connectionInfos.outputs.audio;
        if (audio) {
            metrics.audio = {
                bytesSent: audio.bytesSent,
                packetsSent: audio.packetsSent,
                retransmittedBytesSent: audio.retransmittedBytesSent,
                retransmittedPacketsSent: audio.retransmittedPacketsSent
            };
        }

        const video = connectionInfos.outputs.video;
        if (video) {
            metrics.video = {
                bytesSent: video.bytesSent,
                packetsSent: video.packetsSent,
                retransmittedBytesSent: video.retransmittedBytesSent,
                retransmittedPacketsSent: video.retransmittedPacketsSent,
                firCount: video.firCount, // Full Intra Request (FIR)
                framesEncoded: video.framesEncoded,
                nackCount: video.nackCount,
                totalEncodeTime: video.totalEncodeTime,
                hugeFramesSent: video.hugeFramesSent,
                framesSent: video.framesSent,
                frameHeight: video.frameHeight,
                frameWidth: video.frameWidth
            };
        }
        return metrics;
    }
}
