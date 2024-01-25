/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { IConnector } from './IConnector';

/**
 * MediaReport is a structure returned by {@link IController.onMediaReport} event.
 * It contains the media controller statistics.
 */
export type MediaReport = {
    type: string;
    millis: number;
    tracks: string[];
    stats: {
        jitter_ms: number;
        loss_num: number;
        loss_perc: number;
        nack_num: number;
    };
};

/**
 * RTPProps is a structure returned by {@link IController.onRTPProps} event.
 * It contains the RTP controller statistics.
 */
export type RTPProps = {
    type: string;
    result: boolean;
    drop: number;
    nack: number;
};

/**
 * PlayingInfos is a structure returned by {@link IController.onPlaying} event.
 * It contains the current playing information, updated every second.
 */
export type PlayingInfos = {
    type: string;
    begin: number;
    current: number;
    end: number;
    tracks: number[];
};

/**
 * Check if the connector is a controller
 * @returns true if the connector is a controller
 */
export function IsController(connector: IConnector): connector is IController {
    return 'send' in connector;
}

/**
 * IController is a controller interface extending a stream connector
 * with the capability of sending and receiving commands with the server.
 *
 * This interface can serve the both roles: player or streamer.
 */
export interface IController extends IConnector {
    /**
     * Call to distribute {@link RTPProps}
     * @param rtpProps RTP properties
     * @event
     */
    onRTPProps(rtpProps: RTPProps): void;
    /**
     * Call to distribute {@link MediaReport}
     * @param mediaReport Media report informations
     * @event
     */
    onMediaReport(mediaReport: MediaReport): void;
    /**
     * Call to distribute video bitrate informations
     * @param videoBitrate Current video bitrate
     * @param videoBitrateConstraint Video bitrate constraint computed by the server
     * @event
     */
    onVideoBitrate(videoBitrate: number, videoBitrateConstraint: number): void;
    /**
     * Call to distribute {@link PlayingInfos}
     * @param playingInfos Current playing informations
     * @event
     */
    onPlaying(playingInfos: PlayingInfos): void;
    /**
     * Sets server properties for packet error (nack) and delayed packet loss (drop)
     * for a streamer controller and fires an onRTPProps event if changed successfully.
     * NOTE: Method can also retrieve current server values if called without arguments.
     * @param nack Waiting period before declaring a packet error
     * @param drop Waiting period before considering delayed packets as lost
     */
    setRTPProps(nack?: number, drop?: number): void;
    /**
     * Configure the video bitrate on the server side for a streamer controller
     * @param value video bitrate in bps
     */
    setVideoBitrate(value: number): void;
    /**
     * Configure the audio and video track to play for a player controller
     * @param tracks.audio Audio track
     * @param tracks.video Video track
     */
    setTracks(tracks: { audio?: number; video?: number }): void;
    /**
     * Send a generic command to control the streaming session
     * @param type type of command
     * @param params parameters of the command
     * @example
     * controller.send('video_bitrate', {video_bitrate: 0});
     */
    send(type: string, params: object): void;
}
