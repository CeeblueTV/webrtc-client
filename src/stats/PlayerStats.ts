/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { IStats } from './IStats';
import { ConnectionInfos } from '../connectors/IConnector';
import { Metadata } from '../metadata/Metadata';
import * as utils from '@ceeblue/web-utils';

export class PlayerStats extends utils.PlayerStats implements IStats {
    public declare audioByteRate?: number;
    public declare videoByteRate?: number;

    // States used for incremental stats computation
    private _prevTime: number = 0;
    private _prevAudioBytes: number = 0;
    private _prevVideoBytes: number = 0;
    private _prevVideoEmittedCount: number = 0;
    private _prevAudioEmittedCount: number = 0;
    private _prevVideoJitterDelay: number = 0;
    private _prevAudioJitterDelay: number = 0;
    private _prevSkippedAudio: number = 0;
    private _prevAudioConcealedSamples: number = 0;
    private _prevSkippedVideo: number = 0;
    private _prevVideoDroppedFrames: number = 0;
    private _prevVideoTime: number = 0;
    private _prevRealTime: number = 0;

    constructor() {
        super();
    }

    /**
     * @override{@inheritDoc IStats.onRelease}
     * @event
     */
    onRelease() {}

    /**
     * @returns a JSON representation of the player stats, which is the object itself in this case
     */
    async serialize(): Promise<object> {
        return this;
    }

    /**
     * Computes and updates all player statistics based on the current connection infos, metadata, and playback state.
     * Updates the internal properties of this class including those inherited from {@link utils.PlayerStats}.
     * @param infos        ConnectionInfos: WebRTC connection and input stats.
     * @param metadata     Metadata: Stream metadata and track info.
     * @param currentTime  number: Current playback time (media time) in seconds.
     * @param audioTrackId number (optional): Selected audio track ID.
     * @param videoTrackId number (optional): Selected video track ID.
     */
    public compute(
        infos: ConnectionInfos,
        metadata: Metadata,
        currentTime: number,
        audioTrackId?: number,
        videoTrackId?: number
    ) {
        const audioIn = infos.inputs?.audio;
        const videoIn = infos.inputs?.video;

        // videoTrackId
        this.videoTrackId = videoTrackId;
        const videoTrack = videoTrackId != null ? metadata.tracks.get(videoTrackId) : undefined;

        // audioTrackId
        this.audioTrackId = audioTrackId;
        const audioTrack = audioTrackId != null ? metadata.tracks.get(audioTrackId) : undefined;

        // recvByteRate
        let now = performance.now();
        const deltaTime = Math.max(1, now - this._prevTime);
        this._prevTime = now;

        // audioByteRate
        const audioBytes = audioIn?.bytesReceived;
        if (audioBytes != null) {
            this.audioByteRate = Math.max(0, audioBytes - this._prevAudioBytes) / deltaTime;
            this._prevAudioBytes = audioBytes;
        } else {
            this.audioByteRate = undefined;
        }

        // videoByteRate
        const videoBytes = videoIn?.bytesReceived;
        if (videoBytes != null) {
            this.videoByteRate = Math.max(0, videoBytes - this._prevVideoBytes) / deltaTime;
            this._prevVideoBytes = videoBytes;
        } else {
            this.videoByteRate = undefined;
        }

        // bufferAmount, computed as the max of audio/video jitter
        const videoJitterDelay = videoIn?.jitterBufferDelay;
        const videoEmittedCount = videoIn?.jitterBufferEmittedCount;
        let videoBuffering;
        if (videoJitterDelay != null && videoEmittedCount != null) {
            if (videoEmittedCount > this._prevVideoEmittedCount) {
                videoBuffering =
                    (1000 * Math.max(0, videoJitterDelay - this._prevVideoJitterDelay)) /
                    (videoEmittedCount - this._prevVideoEmittedCount);
            }
            this._prevVideoEmittedCount = videoEmittedCount;
            this._prevVideoJitterDelay = videoJitterDelay;
        }
        const audioJitterDelay = audioIn?.jitterBufferDelay;
        const audioEmittedCount = audioIn?.jitterBufferEmittedCount;
        let audioBuffering;
        if (audioJitterDelay != null && audioEmittedCount != null) {
            if (audioEmittedCount > this._prevAudioEmittedCount) {
                audioBuffering =
                    (1000 * Math.max(0, audioJitterDelay - this._prevAudioJitterDelay)) /
                    (audioEmittedCount - this._prevAudioEmittedCount);
            }
            this._prevAudioEmittedCount = audioEmittedCount;
            this._prevAudioJitterDelay = audioJitterDelay;
        }
        if (videoBuffering != null || audioBuffering != null) {
            this.bufferAmount = Math.max(videoBuffering ?? 0, audioBuffering ?? 0);
        } else {
            this.bufferAmount = undefined;
        }

        // videoPerSecond
        this.videoPerSecond = videoIn?.framesPerSecond;

        // skippedAudio
        const audioConcealedSamples = audioIn?.concealedSamples;
        if (audioConcealedSamples != null && audioTrack && audioTrack.rate) {
            const deltaConcealedSamples = Math.max(audioConcealedSamples - this._prevAudioConcealedSamples, 0);
            this._prevAudioConcealedSamples = audioConcealedSamples; // in samples
            this.skippedAudio = this._prevSkippedAudio + (deltaConcealedSamples / audioTrack.rate) * 1000;
            this._prevSkippedAudio = this.skippedAudio; // in ms
        } else {
            this.skippedAudio = undefined;
        }

        // skippedVideo
        const videoDroppedFrames = videoIn?.framesDropped;
        if (videoDroppedFrames != null && this.videoPerSecond) {
            const deltaDroppedFrames = Math.max(videoDroppedFrames - this._prevVideoDroppedFrames, 0);
            this._prevVideoDroppedFrames = videoDroppedFrames; // in frames
            this.skippedVideo = this._prevSkippedVideo + (deltaDroppedFrames / this.videoPerSecond) * 1000;
            this._prevSkippedVideo = this.skippedVideo; // in ms
        } else {
            this.skippedVideo = undefined;
        }

        // stallCount
        this.stallCount = (videoIn as { freezeCount?: number })?.freezeCount;

        // audioTrackBandwidth
        this.audioTrackBandwidth = audioTrack?.ebps ?? audioTrack?.bps;

        // videoTrackBandwidth
        this.videoTrackBandwidth = videoTrack?.ebps ?? videoTrack?.bps;

        // playbackSpeed
        now = performance.now();
        const videoTime = currentTime;
        let measuredSpeed = 0;
        if (this._prevVideoTime !== undefined && this._prevRealTime !== undefined) {
            const deltaVideoTime = videoTime - this._prevVideoTime;
            const deltaRealTime = (now - this._prevRealTime) / 1000;
            if (deltaVideoTime >= 0 && deltaRealTime > 0.05) {
                measuredSpeed = deltaVideoTime / deltaRealTime;
            }
        }
        this._prevVideoTime = videoTime;
        this._prevRealTime = now;
        this.playbackSpeed = measuredSpeed;

        // rtt
        this.rtt = infos?.candidate?.currentRoundTripTime;

        // jitter
        if (videoIn?.jitter != null || audioIn?.jitter != null) {
            this.jitter = Math.max(videoIn?.jitter ?? 0, audioIn?.jitter ?? 0);
        } else {
            this.jitter = undefined;
        }

        // lostPacketCount, can go down because of how packet loss is computed in WebRTC :  received count - expected count, without taking duplicate into account, which can lead to negative values
        if (videoIn?.packetsLost != null || audioIn?.packetsLost != null) {
            this.lostPacketCount = (videoIn?.packetsLost ?? 0) + (audioIn?.packetsLost ?? 0);
        } else {
            this.lostPacketCount = undefined;
        }
        // nackCount
        if (videoIn?.nackCount != null || audioIn?.nackCount != null) {
            this.nackCount = (videoIn?.nackCount ?? 0) + (audioIn?.nackCount ?? 0);
        } else {
            this.nackCount = undefined;
        }
    }
}
