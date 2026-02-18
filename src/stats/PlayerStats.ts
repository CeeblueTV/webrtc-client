/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { IStats } from './IStats';
import { IConnector } from '../connectors/IConnector';
import { Metadata } from '../metadata/Metadata';
import * as utils from '@ceeblue/web-utils';

export class PlayerStats extends utils.PlayerStats implements IStats {
    // References to external objects and current track indices used for stats computation
    private _connector?: IConnector | undefined;
    private _videoElement: HTMLVideoElement;

    // States used for incremental stats computation
    private _states = {
        prevTime: 0,
        prevAudioBytes: 0,
        prevVideoBytes: 0,
        prevVideoEmittedCount: 0,
        prevAudioEmittedCount: 0,
        prevVideoJitterDelay: 0,
        prevAudioJitterDelay: 0,
        prevskippedAudio: 0,
        prevAudioConcealedSamples: 0,
        prevskippedVideo: 0,
        prevVideoDroppedFrames: 0,
        prevVideoTime: 0,
        prevRealTime: 0
    };

    constructor(videoElement: HTMLVideoElement, connector?: IConnector) {
        super();
        this._connector = connector;
        this._videoElement = videoElement!;
    }

    /**
     * @override{@inheritDoc IStats.onRelease}
     * @event
     */
    onRelease() {}

    async serialize(): Promise<object> {
        return this;
    }

    public async compute(metadata: Metadata, audioTrackId?: number, videoTrackId?: number): Promise<void> {
        if (!this._connector) {
            return;
        }

        const infos = await this._connector.connectionInfos(100);
        const audioIn = infos?.inputs?.audio;
        const videoIn = infos?.inputs?.video;

        // videoTrackId (unused in the player.html)
        this.videoTrackId = videoTrackId;
        // audioTrackId (unused in the player.html)
        this.audioTrackId = audioTrackId;

        // recvByteRate (labeled Bandwidth inside the player.html)
        let now = performance.now();
        const deltaTime = Math.max(1, now - this._states.prevTime);
        const audioBytes = audioIn?.bytesReceived ?? 0;
        const videoBytes = videoIn?.bytesReceived ?? 0;
        const deltaAudio = audioBytes - this._states.prevAudioBytes;
        const deltaVideo = videoBytes - this._states.prevVideoBytes;
        this._states.prevAudioBytes = audioBytes;
        this._states.prevVideoBytes = videoBytes;
        this._states.prevTime = now;
        if (deltaAudio > 0 || deltaVideo > 0) {
            this.recvByteRate = (deltaAudio + deltaVideo) / deltaTime;
        }

        // bufferAmount, computed as the max of audio/video jitter (labeled Buffer inside the player.html)
        const videoJitterDelay = videoIn?.jitterBufferDelay ?? 0;
        const videoEmittedCount = videoIn?.jitterBufferEmittedCount ?? 0;
        const audioJitterDelay = audioIn?.jitterBufferDelay ?? 0;
        const audioEmittedCount = audioIn?.jitterBufferEmittedCount ?? 0;
        const videoDeltaCount = videoEmittedCount - this._states.prevVideoEmittedCount;
        const audioDeltaCount = audioEmittedCount - this._states.prevAudioEmittedCount;
        if (videoDeltaCount > 0 || audioDeltaCount > 0) {
            const videoBuffering =
                (1000 * (videoJitterDelay - this._states.prevVideoJitterDelay)) / Math.max(1, videoDeltaCount);
            const audioBuffering =
                (1000 * (audioJitterDelay - this._states.prevAudioJitterDelay)) / Math.max(1, audioDeltaCount);
            this.bufferAmount = Math.max(videoBuffering, audioBuffering);
        }
        this._states.prevVideoJitterDelay = videoJitterDelay;
        this._states.prevAudioJitterDelay = audioJitterDelay;
        this._states.prevVideoEmittedCount = videoEmittedCount;
        this._states.prevAudioEmittedCount = audioEmittedCount;

        // videoPerSecond (labeled Video FPS inside the player.html)
        const videoPerSecond = videoIn?.framesPerSecond ?? 0;
        this.videoPerSecond = videoPerSecond;

        // skippedAudio: incremental (labeled Skipped audio inside the player.html)
        this.skippedAudio = this._states.prevskippedAudio;
        if (audioTrackId != null) {
            const audioTrack = metadata?.tracks.get(audioTrackId);
            const currentAudioConcealedSamples = audioIn?.concealedSamples ?? 0;
            const deltaConcealedSamples = Math.max(
                currentAudioConcealedSamples - this._states.prevAudioConcealedSamples,
                0
            );
            this._states.prevAudioConcealedSamples = currentAudioConcealedSamples; // in samples
            if (audioTrack && audioTrack.rate) {
                this.skippedAudio += deltaConcealedSamples / audioTrack.rate;
                this._states.prevskippedAudio = this.skippedAudio; // in seconds
            }
        }

        // skippedVideo: incremental (labeled Skipped video inside the player.html)
        this.skippedVideo = this._states.prevskippedVideo;
        const currentVideoDroppedFrames = videoIn?.framesDropped ?? 0;
        if (videoPerSecond > 0) {
            const deltaDroppedFrames = Math.max(currentVideoDroppedFrames - this._states.prevVideoDroppedFrames, 0);
            this._states.prevVideoDroppedFrames = currentVideoDroppedFrames; // in frames
            this.skippedVideo += deltaDroppedFrames / videoPerSecond;
            this._states.prevskippedVideo = this.skippedVideo; // in seconds
        }

        // stallCount: incremental (labeled Stalls inside the player.html)
        this.stallCount = (videoIn as { freezeCount?: number })?.freezeCount ?? 0;

        // Tracks bandwidth
        const tracks = metadata?.tracks;
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
        const videoTime = this._videoElement.currentTime ?? 0;
        let measuredSpeed = 0;
        if (this._states.prevVideoTime !== undefined && this._states.prevRealTime !== undefined) {
            const deltaVideoTime = videoTime - this._states.prevVideoTime;
            const deltaRealTime = (now - this._states.prevRealTime) / 1000;
            if (deltaVideoTime >= 0 && deltaRealTime > 0.05) {
                measuredSpeed = deltaVideoTime / deltaRealTime;
            }
        }
        this._states.prevVideoTime = videoTime;
        this._states.prevRealTime = now;
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
