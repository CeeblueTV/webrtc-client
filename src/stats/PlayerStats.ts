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

        // videoTrackId (unused in the player.html)
        this.videoTrackId = videoTrackId;
        // audioTrackId (unused in the player.html)
        this.audioTrackId = audioTrackId;

        // recvByteRate (labeled Bandwidth inside the player.html)
        let now = performance.now();
        const deltaTime = Math.max(1, now - this._prevTime);
        const audioBytes = audioIn?.bytesReceived ?? 0;
        const videoBytes = videoIn?.bytesReceived ?? 0;
        const deltaAudio = audioBytes - this._prevAudioBytes;
        const deltaVideo = videoBytes - this._prevVideoBytes;
        this._prevAudioBytes = audioBytes;
        this._prevVideoBytes = videoBytes;
        this._prevTime = now;
        if (deltaAudio > 0 || deltaVideo > 0) {
            this.recvByteRate = (deltaAudio + deltaVideo) / deltaTime;
        }

        // bufferAmount, computed as the max of audio/video jitter (labeled Buffer inside the player.html)
        const videoJitterDelay = videoIn?.jitterBufferDelay ?? 0;
        const videoEmittedCount = videoIn?.jitterBufferEmittedCount ?? 0;
        const audioJitterDelay = audioIn?.jitterBufferDelay ?? 0;
        const audioEmittedCount = audioIn?.jitterBufferEmittedCount ?? 0;
        const videoDeltaCount = videoEmittedCount - this._prevVideoEmittedCount;
        const audioDeltaCount = audioEmittedCount - this._prevAudioEmittedCount;
        if (videoDeltaCount > 0 || audioDeltaCount > 0) {
            const videoBuffering =
                (1000 * (videoJitterDelay - this._prevVideoJitterDelay)) / Math.max(1, videoDeltaCount);
            const audioBuffering =
                (1000 * (audioJitterDelay - this._prevAudioJitterDelay)) / Math.max(1, audioDeltaCount);
            this.bufferAmount = Math.max(videoBuffering, audioBuffering);
        }
        this._prevVideoJitterDelay = videoJitterDelay;
        this._prevAudioJitterDelay = audioJitterDelay;
        this._prevVideoEmittedCount = videoEmittedCount;
        this._prevAudioEmittedCount = audioEmittedCount;

        // videoPerSecond (labeled Video FPS inside the player.html)
        const videoPerSecond = videoIn?.framesPerSecond ?? 0;
        this.videoPerSecond = videoPerSecond;

        // skippedAudio: incremental (labeled Skipped audio inside the player.html)
        this.skippedAudio = this._prevSkippedAudio;
        if (audioTrackId != null) {
            const audioTrack = metadata.tracks.get(audioTrackId);
            const currentAudioConcealedSamples = audioIn?.concealedSamples ?? 0;
            const deltaConcealedSamples = Math.max(currentAudioConcealedSamples - this._prevAudioConcealedSamples, 0);
            this._prevAudioConcealedSamples = currentAudioConcealedSamples; // in samples
            if (audioTrack && audioTrack.rate) {
                this.skippedAudio += deltaConcealedSamples / audioTrack.rate;
                this._prevSkippedAudio = this.skippedAudio; // in seconds
            }
        }

        // skippedVideo: incremental (labeled Skipped video inside the player.html)
        this.skippedVideo = this._prevSkippedVideo;
        const currentVideoDroppedFrames = videoIn?.framesDropped ?? 0;
        if (videoPerSecond > 0) {
            const deltaDroppedFrames = Math.max(currentVideoDroppedFrames - this._prevVideoDroppedFrames, 0);
            this._prevVideoDroppedFrames = currentVideoDroppedFrames; // in frames
            this.skippedVideo += deltaDroppedFrames / videoPerSecond;
            this._prevSkippedVideo = this.skippedVideo; // in seconds
        }

        // stallCount: incremental (labeled Stalls inside the player.html)
        this.stallCount = (videoIn as { freezeCount?: number })?.freezeCount ?? 0;

        // Tracks bandwidth
        const tracks = metadata.tracks;
        if (tracks) {
            const audioTrack = tracks.get(audioTrackId ?? 0);
            const videoTrack = tracks.get(videoTrackId ?? 0);
            if (audioTrack) {
                // audioTrackBandwidth (labeled Track audio inside the player.html)
                this.audioTrackBandwidth = audioTrack.ebps ?? audioTrack.bps;
            }
            if (videoTrack) {
                // videoTrackBandwidth (labeled Track video inside the player.html)
                this.videoTrackBandwidth = videoTrack.ebps ?? videoTrack.bps;
            }
        }

        // playbackSpeed (labeled Playback speed inside the player.html)
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

        // rtt (labeled RTT inside the player.html)
        this.rtt = infos?.candidate?.currentRoundTripTime ?? 0;

        // jitter (labeled Jitter inside the player.html)
        this.jitter = Math.max(videoIn?.jitter ?? 0, audioIn?.jitter ?? 0);

        // lostPacketCount : incremental, but can go down because of how packet loss is computed in WebRTC :  received count - expected count, without taking duplicate into account, which can lead to negative values
        // (labeled Packet loss inside the player.html)
        this.lostPacketCount = (videoIn?.packetsLost ?? 0) + (audioIn?.packetsLost ?? 0);
        // nackCount : incremental
        // (labeled Nacks inside the player.html)
        this.nackCount = (videoIn?.nackCount ?? 0) + (audioIn?.nackCount ?? 0);
    }
}
