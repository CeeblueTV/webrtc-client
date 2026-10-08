/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Loggable } from '@ceeblue/web-utils';
import { IStats } from './IStats';
import { ConnectionInfos } from '../connectors/IConnector';
import { MediaReport } from '../connectors/IController';

/**
 * StreamerStats holds the statistics of a {@link Streamer}, refreshed every second while streaming.
 * Get it with {@link Streamer.computeStats}, it can be reported as is with a {@link Telemetry}.
 */
export class StreamerStats extends Loggable implements IStats {
    protocol?: string;
    /**
     * Audio bytes sent per millisecond
     */
    audioByteRate?: number;
    /**
     * Video bytes sent per millisecond
     */
    videoByteRate?: number;
    /**
     * Encoded video frames per second
     */
    videoPerSecond?: number;
    videoWidth?: number;
    videoHeight?: number;
    /**
     * Average encoding time of a video frame, in milliseconds
     */
    encodeTime?: number;
    /**
     * Reason why the browser limits the video resolution or framerate: 'none', 'cpu', 'bandwidth' or 'other'
     */
    qualityLimitationReason?: string;
    /**
     * Round trip time, in seconds
     */
    rtt?: number;
    /**
     * Outgoing bitrate available as estimated by the browser, in bits per second
     */
    availableOutgoingBitrate?: number;
    /**
     * Cumulative count of NACK received from the server
     */
    nackCount?: number;
    /**
     * Cumulative count of retransmitted packets
     */
    retransmittedPacketCount?: number;
    /**
     * Video bitrate target configured by the server, in bits per second (controllable connector only)
     */
    videoBitrate?: number;
    /**
     * Video bitrate constraint computed by the server, in bits per second (controllable connector only)
     */
    videoBitrateConstraint?: number;
    /**
     * Jitter measured by the server, in seconds (controllable connector only)
     */
    serverJitter?: number;
    /**
     * Packets lost as counted by the server (controllable connector only)
     */
    serverLostPacketCount?: number;
    /**
     * Packet loss percentage measured by the server (controllable connector only)
     */
    serverLossPercent?: number;
    /**
     * NACK count reported by the server (controllable connector only)
     */
    serverNackCount?: number;

    // States used for incremental stats computation
    private _prevTime: number = 0;
    private _prevAudioBytes: number = 0;
    private _prevVideoBytes: number = 0;
    private _prevFramesEncoded: number = 0;
    private _prevTotalEncodeTime: number = 0;

    constructor() {
        super();
        this.protocol = 'WebRTC';
    }

    /**
     * @override{@inheritDoc IStats.onRelease}
     * @event
     */
    onRelease() {}

    /**
     * @returns a JSON representation of the streamer stats, which is the object itself in this case
     */
    async serialize(): Promise<object> {
        return this;
    }

    /**
     * Computes and updates all streamer statistics based on the current connection infos and server feedback.
     * @param infos ConnectionInfos: WebRTC connection and output stats.
     * @param mediaReport MediaReport (optional): last server media report, controllable connector only.
     * @param videoBitrate number (optional): video bitrate target configured by the server.
     * @param videoBitrateConstraint number (optional): video bitrate constraint computed by the server.
     */
    public compute(
        infos: ConnectionInfos,
        mediaReport?: MediaReport,
        videoBitrate?: number,
        videoBitrateConstraint?: number
    ) {
        const audioOut = infos.outputs?.audio;
        const videoOut = infos.outputs?.video;

        const now = performance.now();
        const deltaTime = Math.max(1, now - this._prevTime);
        this._prevTime = now;

        // audioByteRate
        const audioBytes = audioOut?.bytesSent;
        if (audioBytes != null) {
            this.audioByteRate = Math.max(0, audioBytes - this._prevAudioBytes) / deltaTime;
            this._prevAudioBytes = audioBytes;
        } else {
            this.audioByteRate = undefined;
        }

        // videoByteRate
        const videoBytes = videoOut?.bytesSent;
        if (videoBytes != null) {
            this.videoByteRate = Math.max(0, videoBytes - this._prevVideoBytes) / deltaTime;
            this._prevVideoBytes = videoBytes;
        } else {
            this.videoByteRate = undefined;
        }

        // video
        this.videoPerSecond = videoOut?.framesPerSecond;
        this.videoWidth = videoOut?.frameWidth;
        this.videoHeight = videoOut?.frameHeight;
        this.qualityLimitationReason = videoOut?.qualityLimitationReason;

        // encodeTime
        const framesEncoded = videoOut?.framesEncoded;
        const totalEncodeTime = videoOut?.totalEncodeTime;
        if (framesEncoded != null && totalEncodeTime != null) {
            if (framesEncoded > this._prevFramesEncoded) {
                this.encodeTime =
                    (1000 * Math.max(0, totalEncodeTime - this._prevTotalEncodeTime)) /
                    (framesEncoded - this._prevFramesEncoded);
            }
            this._prevFramesEncoded = framesEncoded;
            this._prevTotalEncodeTime = totalEncodeTime;
        } else {
            this.encodeTime = undefined;
        }

        // rtt and availableOutgoingBitrate
        this.rtt = infos.candidate?.currentRoundTripTime;
        this.availableOutgoingBitrate = infos.candidate?.availableOutgoingBitrate;

        // nackCount, only video carries it on outbound stats
        this.nackCount = videoOut?.nackCount;

        // retransmittedPacketCount
        if (videoOut?.retransmittedPacketsSent != null || audioOut?.retransmittedPacketsSent != null) {
            this.retransmittedPacketCount =
                (videoOut?.retransmittedPacketsSent ?? 0) + (audioOut?.retransmittedPacketsSent ?? 0);
        } else {
            this.retransmittedPacketCount = undefined;
        }

        // server feedback
        this.videoBitrate = videoBitrate;
        this.videoBitrateConstraint = videoBitrateConstraint;
        const serverStats = mediaReport?.stats;
        this.serverJitter = serverStats?.jitter_ms != null ? serverStats.jitter_ms / 1000 : undefined;
        this.serverLostPacketCount = serverStats?.loss_num;
        this.serverLossPercent = serverStats?.loss_perc;
        this.serverNackCount = serverStats?.nack_num;
    }
}
