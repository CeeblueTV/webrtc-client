/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/**
 * This example demonstrates how to use the WebRTC Player and report metrics to a telemetry server.
 * It also allows to visualize the metrics in real-time to analyze the stream quality.
 * 
 * Special query options :
 * - statsType=player : Use the PlayerStats class to report metrics, instead of the CustomStats class
 * - telemetryURL=<URL> : Use a custom telemetry server URL
 */

import { Player, HTTPConnector, WSController, utils, VERSION, PlayerStats, Telemetry } from "../../dist/webrtc-client.js";
import { CustomStats, ErrorStats, readableBitrate } from "./CustomStats.js";
// development version, includes helpful console warnings
// import { createApp } from 'https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js';
// production version, optimized for size and speed
import { createApp } from 'https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js';
console.log('webrtc-client version:', VERSION);

const { Util, NetAddress } = utils;

const PlayState = {
    PLAYING: 'PLAYING',
    STARTING: 'STARTING',
    STOPPED: 'STOPPED'
};

function toHuman(value) {
    if (!value || typeof value !== 'number' || value % 1 !== 0) {
        return value;
    }
    const i = Math.floor(Math.log(value) / Math.log(1000));
    const sizes = ['', ' K', ' M', ' G'];
    return i ? ((value / Math.pow(1000, i)).toFixed(3) + sizes[i]) : value;
}

// Convert metrics to one line strings (recursive method)
function writeMetrics(metrics, lines=[], prefix = '') {
    for (let [key, value] of Object.entries(metrics)) {
        key = (prefix.length? (prefix + '.') : '') + key;
        if (typeof value === 'number' || typeof value === 'string') {
            lines.push(`${key}: ${toHuman(value)}`);
        } else if (typeof value === 'object') {
            writeMetrics(value, lines, key);
        }
    }
    return lines;
}

const vueApp = {
    data() {
        return {
            PlayState: PlayState,
            playState: PlayState.STOPPED,

            streamName: '',
            accessToken: null,
            muted: true,
            host: null,

            streamMetadata: null,
            videoTracks: new Map(),
            videoTrack: 'Video',
            videoTrackId: undefined,
            oldVideoTrackId: undefined,
            connectorType:'WebSocket (WS)',
            connectorTypes:['WebSocket (WS)', 'WHEP (HTTP)'],
            audioTracks: new Map(),
            audioTrack: 'Audio',
            audioTrackId: undefined,
            streamErrorMessage: null,

            statsClass: CustomStats,
            telemetryTimer: null,
            metrics: null,
            telemetry: null,
            stats: null,
            telemetryURL: null,

            player: null
        }
    },
    created() {
        const options = Util.options();
        // init values
        const host = options.host;
        this.host = new NetAddress(host || location.host, 443);
        this.streamName = options.stream;
        this.accessToken = options.accessToken;
        this.connectorType = options.whep || (host && host.toLowerCase().startsWith('http')) ? this.connectorTypes[1] : this.connectorTypes[0];
        this.statsClass = options.statsType === 'player' ? PlayerStats : CustomStats;
        this.telemetryURL = options.telemetryURL || 'http://localhost:7001/metrics';
    },
    methods: {
        startPlayback() {

            this.playState = PlayState.STARTING;

            const videoElement = this.$refs.video;
            videoElement.muted = this.muted;
            videoElement.autoplay = true;
            videoElement.onloadeddata = () => {
                console.log('WebRTC loadeddata');
                videoElement.play();
            };

            this.player = new Player(this.connectorType.startsWith('WebSocket') ? WSController : HTTPConnector);
            this.player.onError = error => {
                console.warn(error);
                this.streamErrorMessage = error;
                this.telemetry.report(new ErrorStats(error, this.stats.sessionId), 0);
            }
            this.player.onStart = stream => {
                console.log('WebRTCPlayer => PlayerStarted');
                this.playState = PlayState.PLAYING;
                videoElement.srcObject = stream;
            };
            this.player.onStop = (error) => {
                console.log('WebRTCPlayer => PlayerStopped', error);
                videoElement.srcObject = null;
                videoElement.onloadeddata = null;
                this.stopPlayback();
            };
            this.player.onPlaying = () => {

                if (this.oldVideoTrackId !== this.player.videoTrack) {
                    // Send a new stats report when the video track changes
                    if (this.stats.setTrackChange) {
                        this.stats.setTrackChange(this.videoTrackId != null ? 'manual' : 'auto');
                    }
                    // Send the report, then every 60 seconds
                    this.telemetry.report(this.stats);
                    this.telemetry.report(this.stats, 60);

                    // if not AUTO update the current video track
                    if(this.videoTrackId != null) {
                        this.videoTrackId = this.player.videoTrack;
                    }
                    this.oldVideoTrackId = this.player.videoTrack;
                }
                this.videoTrack = this.videoTracks.get(this.player.videoTrack);

                // if not AUTO update the current audio track
                if(this.audioTrackId != null) {
                    this.audioTrackId = this.player.audioTrack;
                }
                this.audioTrack = this.audioTracks.get(this.player.audioTrack);
            };
            this.player.onMetadata = metadata => {
                this.updateStreamMetadata(metadata);
            };
            this.player.start({
                    host:this.host.toString(),
                    streamName: this.streamName,
                    accessToken: this.accessToken,
                    iceServer: {
                        urls: ['turn:' + this.host.domain + ':3478?transport=tcp', 'turn:' + this.host.domain + ':3478'],
                        username: 'csc_demo', credential: 'UtrAFClFFO'
                    }
            });

            // Metrics
            this.telemetry = new Telemetry(this.telemetryURL);
            this.telemetry.onLog = log => console.log('Telemetry:', log);
            this.telemetry.onError = error => console.error('Telemetry:', error);
            this.stats = new this.statsClass(this.player, videoElement);
            // (The first report will be in the next track change)

            // Start the metrics rendering
            const renderStats = new this.statsClass(this.player, videoElement);
            this.renderTimer = setInterval(() => {
                renderStats.serialize().then(data => {
                    this.metrics = writeMetrics(data);
                });
            }, 2000); // Every 2 second
        },
        stopPlayback() {
            console.log('StopPlayback');

            if (this.player) {
                this.player.stop();
                this.player = null;
            }
            clearInterval(this.telemetryTimer);
            clearInterval(this.renderTimer);
            this.telemetryTimer = this.renderTimer = null;

            this.audioTracks = new Map();
            this.audioTrack = 'Audio';
            this.audioTrackId = undefined;
            this.videoTracks = new Map();
            this.videoTrack = 'Video';
            this.videoTrackId = undefined;

            this.playState = PlayState.STOPPED;
        },
        mutePlayback() {
            console.log('MutePlayback');
            this.$refs.video.muted = this.muted;
        },
        updateStreamMetadata(metadata) {
            this.audioTracks = new Map();
            this.videoTracks = new Map();

            for (const [id, track] of metadata.tracks) {

                if (track.type === 'video') {
                    this.videoTracks.set(
                        id,
                        `${track.codec} ${track.width}x${track.height} ${readableBitrate(track.bps * 8)}`
                    );
                } else if (track.type === 'audio') {
                    this.audioTracks.set(
                        id,
                        `${track.codec} ${track.channels}ch ${track.rate}Hz ${readableBitrate(track.bps * 8)}`
                    );
                }
            }
        },
        play() {
            this.streamErrorMessage = null;
            if(this.playState === PlayState.STOPPED) {
                if (!this.streamName) {
                    this.streamErrorMessage = "Enter a non-empty stream name to play";
                    return;
                }
                this.startPlayback();
            } else {
                this.stopPlayback();
            }
        },
        mute() {
            this.muted = !this.muted;
            this.mutePlayback();
        },

        playButtonCaption() {
            if (this.isStopped()) {
                return 'Play';
            }
            if (this.isStarting()) {
                return 'Starting... ';
            } 
            if (this.isPlaying()) {
                return 'Stop';
            }
        },
        isPlaying() {
            return this.playState === PlayState.PLAYING;
        },
        isStarting() {
            return this.playState === PlayState.STARTING;
        },
        isStopped() {
            return this.playState === PlayState.STOPPED;
        },
        onVideoTrackChange() {
            if (this.player) {
                this.player.videoTrack = this.videoTrackId;
            }
        },
        onAudioTrackChange() {
            if (this.player) {
                this.player.audioTrack = this.audioTrackId;
            }
        }
    },
}

// Create the main app
createApp(vueApp).mount('#main');