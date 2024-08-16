/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Player } from '../Player';
import { ILog, Util, EventEmitter } from '@ceeblue/web-utils';
import { IStats } from './IStats';

/**
 * PlayerStats implements the statistics serialization for a {@link Player} instance.
 */
export class PlayerStats extends EventEmitter implements IStats, ILog {
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

    private _player: Player;
    private _lastBytesReceived: number;
    private _lastBytesReceivedTime: number;
    /**
     * Build a PlayerStats instance to report player stats
     * @param player player instance
     */
    constructor(player: Player) {
        super();
        this._player = player;
        this._lastBytesReceived = 0;
        this._lastBytesReceivedTime = Date.now();
        player.once('stop', () => this.onRelease());
    }

    /**
     * Return player stats into a Object representation
     * @override
     */
    async serialize(): Promise<object> {
        if (!this._player.running) {
            return Promise.reject();
        }
        // Main info
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metrics: any = {
            streamId: this._player.streamName,
            audioTrack: this._player.audioTrack,
            videoTrack: this._player.videoTrack,
            dataTracks: this._player.dataTracks.length ? this._player.dataTracks : undefined
        };
        // Media report info
        const playingInfos = this._player.playingInfos;
        if (playingInfos) {
            metrics.streamBegin = playingInfos.begin;
            metrics.streamCurrent = playingInfos.current;
            metrics.streamEnd = playingInfos.end;
        }

        let connectionInfos;
        try {
            connectionInfos = await this._player.connectionInfos();
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

            metrics.localCandidateProtocol =
                candidate.localCandidateProtocol +
                (candidate.localCandidateRelayProtocol ? '/' + candidate.localCandidateRelayProtocol : '');

            // Compute incoming bitrate
            const diff = metrics.bytesReceived - this._lastBytesReceived;
            this._lastBytesReceived = metrics.bytesReceived;
            const now = Date.now();
            const duration = (now - this._lastBytesReceivedTime) / 1000;
            this._lastBytesReceivedTime = now;
            metrics.incomingBitrate = Math.round((diff * 8) / duration);

            metrics.availableIncomingBitrate = candidate.availableIncomingBitrate;
        }

        const audio = connectionInfos.inputs.audio;
        if (audio) {
            metrics.audio = {
                bytesReceived: audio.bytesReceived,
                jitter: audio.jitter,
                packetsLost: audio.packetsLost,
                packetsReceived: audio.packetsReceived,
                nackCount: audio.nackCount
            };
        }

        const video = connectionInfos.inputs.video;
        if (video) {
            metrics.video = {
                bytesReceived: video.bytesReceived,
                jitter: video.jitter,
                packetsLost: video.packetsLost,
                packetsReceived: video.packetsReceived,
                nackCount: video.nackCount,

                pliCount: video.pliCount, // Picture Loss Indication (PLI)
                //freezeCount? (not standard)
                framesDecoded: video.framesDecoded,
                totalDecodeTime: video.totalDecodeTime,
                framesDropped: video.framesDropped,
                framesReceived: video.framesReceived,
                frameHeight: video.frameHeight,
                frameWidth: video.frameWidth
            };
        }
        return metrics;
    }
}
