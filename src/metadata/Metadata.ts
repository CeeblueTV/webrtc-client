/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/**
 * List the media type in their string version as received from server
 */
export enum MType {
    AUDIO = 'audio',
    VIDEO = 'video',
    DATA = 'data'
}

/**
 * Media Source representation
 */
export type MSource = {
    hrn: string;
    type: string;
    priority: number;
    relurl: string;
    url: string;
    simul_tracks: number;
    total_matches: number;
};

/**
 * Media Track representation
 */
export type MTrack = {
    idx: number;
    trackid: number;
    name: string;
    type: MType;
    codec: string;
    firstms: number;
    lastms: number;
    bps: number;
    maxbps: number;
    init: string;
    channels: number;
    rate: number;
    size: number;
    fpks: number;
    width: number;
    height: number;
    up?: MTrack; // track up by ascending MAXBPS
    down?: MTrack; // track down by ascending MAXBPS
};

function filter(tracks: Map<number, MTrack>, medias: Array<MTrack>, codecs: Set<string>) {
    for (let i = 0; i < medias.length; ++i) {
        const media = medias[i];
        if (!codecs.has(media.codec.toLowerCase())) {
            tracks.delete(media.idx);
            medias.splice(i--, 1);
        }
    }
}

/**
 * Metadata representation
 */
export class Metadata {
    type: string = '';
    /**
     * Width resolution size
     */
    width: number = 0;
    /**
     * Height resolution size
     */
    height: number = 0;
    /**
     * Sources available to play the stream
     */
    sources: Map<string, MSource> = new Map<string, MSource>(); // url <=> source
    /**
     * Tracks sorted by descending BPS
     */
    tracks: Map<number, MTrack> = new Map<number, MTrack>();
    /**
     * Audio tracks sorted by descending BPS
     */
    audios: Array<MTrack> = [];
    /**
     * Video tracks sorted by descending BPS
     */
    videos: Array<MTrack> = [];
    /**
     * Data track
     */
    datas: Array<MTrack> = [];

    /**
     * Return a new metadata subset with only track with a codec supported
     * @param codecs codecs supported
     * @returns the subset of metadata
     */
    subset(codecs?: Set<string>): Metadata {
        const metadata: Metadata = { ...this };
        if (codecs) {
            filter(metadata.tracks, metadata.audios, codecs);
            filter(metadata.tracks, metadata.videos, codecs);
            // Fix UP/DOWN
            for (const [, track] of metadata.tracks) {
                while (track.up && !metadata.tracks.has(track.up.idx)) {
                    track.up = track.up.up;
                }
                while (track.down && !metadata.tracks.has(track.down.idx)) {
                    track.down = track.down.down;
                }
            }
        }
        return metadata;
    }
}
