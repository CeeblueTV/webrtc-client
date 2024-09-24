/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

export { Player, PlayerError } from './src/Player';
export { Streamer, StreamerError } from './src/Streamer';
// Connectors
export { IConnector, ConnectorError, ConnectionInfos } from './src/connectors/IConnector';
export { IController, PlayingInfos, RTPProps, MediaReport } from './src/connectors/IController';
export { SIPConnector } from './src/connectors/SIPConnector';
export { HTTPConnector } from './src/connectors/HTTPConnector';
export { WSController } from './src/connectors/WSController';
// AdaptiveBitrate
export { ABRAbstract, ABRParams } from './src/abr/ABRAbstract';
export { ABRGrade } from './src/abr/ABRGrade';
export { ABRLinear } from './src/abr/ABRLinear';
// MultiBitrate
export { MBRAbstract, MBRParams } from './src/mbr/MBRAbstract';
export { MBRLinear } from './src/mbr/MBRLinear';
// Stats
export { Telemetry } from './src/stats/Telemetry';
export { IStats } from './src/stats/IStats';
export { StreamerStats } from './src/stats/StreamerStats';
// Metadata
export { Metadata, MSource, MTrack, MType } from './src/metadata/Metadata';
export { StreamMetadata } from './src/metadata/StreamMetadata';
// Timed metadata
export { IStreamData } from './src/metadata/IStreamData';
export { WSStreamData } from './src/metadata/WSStreamData';

export * as utils from '@ceeblue/web-utils';

const __lib__version__ = '?'; // will be replaced on building by project version

export const VERSION: string = __lib__version__;
