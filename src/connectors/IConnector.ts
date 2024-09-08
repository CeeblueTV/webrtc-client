/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Loggable } from '@ceeblue/web-utils';

/**
 * This is the structure returned by the connectionInfos() method
 * to get statistics about current connection
 */
export type ConnectionInfos = {
    /**
     * inputs channel
     */
    inputs: {
        audio?: RTCInboundRtpStreamStats;
        video?: RTCInboundRtpStreamStats;
    };
    /**
     * outputs channel
     */
    outputs: {
        audio?: RTCOutboundRtpStreamStats;
        video?: RTCOutboundRtpStreamStats;
    };
    /**
     * Selected candidate pair
     */
    candidate?: RTCIceCandidatePairStats;
};

/**
 * IConnector is a common interface for representing a stream connection with the server.
 *
 * This interface can serve the both roles: player or streamer.
 */
export interface IConnector extends Loggable {
    /**
     * Call when connector is open
     * @param stream MediaStream description provided from the server if we are the player,
     * or build from the local camera if we are the streamer.
     * @event
     */
    onOpen(stream: MediaStream): void;
    /**
     * Call when connector is closed
     * @event
     */
    onClose(): void;
    /**
     * True when connector is opened, in other words when {@link onOpen} event is fired
     */
    readonly opened: boolean;
    /**
     * True when connector is closed, in other words when {@link onClose} event is fired
     */
    readonly closed: boolean;
    /**
     * Media Stream description delivred from the server if we are player,
     * or build from the local camera if we are the streamer.
     */
    readonly stream?: MediaStream;
    /**
     * Stream name, for example `as+bc3f535f-37f3-458b-8171-b4c5e77a6137`
     */
    readonly streamName: string;
    /**
     * Indicate codecs supported, should be set before than {@link onOpen} happen
     */
    readonly codecs: Set<string>;
    /**
     * Request connections infos with caching option to save loading cost
     * @param cacheDuration indicate how many time we can cache the last connection informations
     * @returns Promise with a ConnectionInfos on success
     */
    connectionInfos(cacheDuration?: number): Promise<ConnectionInfos>;
    /**
     *  Close the connector
     * @param error the error reason if is not a proper close
     */
    close(error?: string): void;
}
