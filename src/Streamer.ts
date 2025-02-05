/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Util, ILog, Connect, EventEmitter, WebSocketReliableError } from '@ceeblue/web-utils';
import { ConnectionInfos, ConnectorError, IConnector } from './connectors/IConnector';
import { WSController } from './connectors/WSController';
import { HTTPConnector } from './connectors/HTTPConnector';
import { IController, IsController, RTPProps, MediaReport } from './connectors/IController';
import { ABRAbstract, ABRParams } from './abr/ABRAbstract';
import { ABRLinear } from './abr/ABRLinear';

export type StreamerError =
    /**
     * Represents a {@link ConnectorError} error
     */
    | ConnectorError
    /**
     * Represents a {@link WebSocketReliableError} error
     */
    | WebSocketReliableError;
/**
 * Use Streamer to broadcast to a WebRTC server.
 *
 * You can use a controllable version using a `WSController` as connector, or change it to use a `HTTPConnector` (HTTP WHIP).
 * By default it uses a `WSController` excepting if on {@link Streamer.start} you use a {@link Connect.Params.endPoint} prefixed with a `http://` protocol.
 * With a controllable connector you can change video bitrate during the streaming, what is not possible with a HTTP(WHIP) connector.
 *
 * @example
 * const streamer = new Streamer();
 * // const streamer = new Streamer(isWHEP ? HTTPConnector : WSController);
 * streamer.onStart = stream => {
 *    console.log('start streaming');
 * }
 * streamer.onStop = _ => {
 *    console.log('stop streaming');
 * }
 * navigator.mediaDevices
 * .getUserMedia({ audio: true, video: true })
 * .then(stream => {
 *    streamer.start(stream, {
 *       endPoint: address, // if address is prefixed by `http://` it uses a HTTPConnector (HTTP-WHIP) if Streamer is build without contructor argument
 *       streamName: 'as+bc3f535f-37f3-458b-8171-b4c5e77a6137'
 *    });
 *    ...
 *    streamer.stop();
 * });
 */
export class Streamer extends EventEmitter {
    /**
     * Event fired when the stream has started
     * @param stream
     * @event
     */
    onStart(stream: MediaStream) {
        this.log('onStart').info();
    }

    /**
     * Event fired when the stream has stopped
     * @param error error description on an improper stop
     * @event
     */
    onStop(error?: StreamerError) {
        if (error) {
            this.log('onStop', error).error();
        } else {
            this.log('onStop').info();
        }
    }

    /**
     * Event fired when an RTP setting change occurs
     * @param props
     */
    onRTPProps(props: RTPProps) {}

    /**
     * Event fired to report media statistics
     * @param mediaReport
     */
    onMediaReport(mediaReport: MediaReport) {}

    /**
     * Event fired when a video bitrate change occurs
     * @param videoBitrate
     * @param videoBitrateConstraint
     */
    onVideoBitrate(videoBitrate: number, videoBitrateConstraint: number) {
        this.log(`onVideoBitrate ${Util.stringify({ videoBitrate, videoBitrateConstraint })}`).info();
    }

    /**
     * Stream name, for example `as+bc3f535f-37f3-458b-8171-b4c5e77a6137`
     */
    get streamName(): string {
        return this._connector ? this._connector.streamName : '';
    }

    /**
     * Camera media stream as specified by [MediaStream](https://developer.mozilla.org/docs/Web/API/MediaStream)
     */
    get stream(): MediaStream | undefined {
        return this._connector && this._connector.stream;
    }

    /**
     * Returns true when streamer is running (between a {@link Streamer.start} and a {@link Streamer.stop})
     */
    get running(): boolean {
        return this._connector ? true : false;
    }

    /**
     * Returns the {@link IController} instance when starting with a connector with controllable ability,
     * or undefined if stream is not starting or stream is not controllable.
     */
    get controller(): IController | undefined {
        return this._controller;
    }

    /**
     * Returns the {@link IConnector} instance, or undefined if stream is not starting.
     */
    get connector(): IConnector | undefined {
        return this._connector;
    }

    /**
     * Last {@link MediaReport} statistics
     */
    get mediaReport(): MediaReport | undefined {
        return this._mediaReport;
    }

    /**
     * Last {@link RTPProps} statistics
     */
    get rtpProps(): RTPProps | undefined {
        return this._rtpProps;
    }

    /**
     * Video bitrate configured by the server,
     * can be undefined on start or when there is no controllable connector
     * @note Use {@link connectionInfos} to get the current precise audio or video bitrate
     */
    get videoBitrate(): number | undefined {
        return this._videoBitrate;
    }

    /**
     * Configure the video bitrate from the server,
     * possible only if your {@link Streamer} instance is built with a controllable connector
     * Set undefined to remove this configuration
     */
    set videoBitrate(value: number | undefined) {
        if (value === this._videoBitrate) {
            return;
        }
        if (!this._controller) {
            throw Error('Cannot set videoBitrate without start a controllable session');
        }
        if (value == null) {
            this._videoBitrateFixed = false;
            return;
        }
        this._videoBitrateFixed = true;
        this._videoBitrate = value;
        this._controller.setVideoBitrate(value);
    }

    /**
     * Video bitrate constraint configured by the server,
     * can be undefined on start or when there is no controllable connector
     * @note Use {@link connectionInfos} to get the current precise audio or video bitrate
     */
    get videoBitrateConstraint(): number | undefined {
        return this._videoBitrateConstraint;
    }

    private _connector?: IConnector;
    private _controller?: IController;
    private _mediaReport?: MediaReport;
    private _videoBitrate?: number;
    private _videoBitrateConstraint?: number;
    private _videoBitrateFixed: boolean;
    private _rtpProps?: RTPProps;
    /**
     * Constructs a new Streamer instance, optionally with a custom connector
     * This doesn't start the broadcast, you must call start() method
     * @param Connector Connector class to use for signaling, can be determined automatically from URL in the start() method
     */
    constructor(private Connector?: { new (connectParams: Connect.Params, stream: MediaStream): IConnector }) {
        super();
        this._videoBitrateFixed = false;
    }

    /**
     * Sets server properties for packet error (nack) and delayed packet loss (drop)
     * and fires an onRTPProps event if changed successfully.
     * NOTE: Method can also retrieve current server values if called without arguments.
     * @param nack Waiting period before declaring a packet error
     * @param drop Waiting period before considering delayed packets as lost
     */
    setRTPProps(nack?: number, drop?: number) {
        if (!this._controller) {
            throw Error('Cannot set rtpProps without start a controllable session');
        }
        this._controller.setRTPProps(nack, drop);
    }

    /**
     * Returns connection info, such as round trip time, requests sent and received,
     * bytes sent and received, and bitrates
     * NOTE: This call is resource-intensive for the CPU.
     * @returns {Promise<ConnectionInfos>} A promise for a ConnectionInfos
     */
    connectionInfos(): Promise<ConnectionInfos> {
        if (!this._connector) {
            return Promise.reject('Start streamer before to request connection infos');
        }
        return this._connector.connectionInfos();
    }

    /**
     * Starts broadcasting the stream
     * The connector is determined automatically from {@link Connect.Params.endPoint} if not forced in the constructor.
     *
     * The `adaptiveBitrate` option can take three different types of value:
     * - A {@link ABRParams} parameters to configure the default ABRLinear implementation
     * - undefined to disable ABR management
     * - Use a custom {@link ABRAbstract} implementation instance
     *
     * @param stream {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaStream MediaStream} instance to stream
     * @param params Connection parameters
     * @param adaptiveBitrate Adaptive bitrate implementation or ABRParams to configure the default implementation
     */
    start(stream: MediaStream, params: Connect.Params, adaptiveBitrate: ABRAbstract | ABRParams | undefined = {}) {
        this.stop();

        // Connector
        let abr: ABRAbstract;
        this._videoBitrateFixed = false;
        this._connector = new (this.Connector || (params.endPoint.startsWith('http') ? HTTPConnector : WSController))(
            params,
            stream
        );

        this._connector.log = this.log.bind(this, 'Signaling:') as ILog;

        this._connector.onOpen = stream => this.onStart(stream);
        this._connector.onClose = (error?: ConnectorError) => {
            // reset to release resources!
            abr?.reset();
            // Stop the streamer if signaling fails!
            this.stop(error);
        };

        if (!IsController(this._connector)) {
            if (adaptiveBitrate) {
                this.log(
                    `Cannot use an adaptive bitrate without a controller: Connector ${this._connector.constructor.name} doesn't implement IController`
                ).error();
            }
            return;
        }

        // Controller
        if (adaptiveBitrate) {
            if ('compute' in adaptiveBitrate) {
                abr = adaptiveBitrate;
            } else {
                abr = new ABRLinear(adaptiveBitrate);
                abr.log = this.log.bind(this, 'AdaptiveBitrate:') as ILog;
            }
        }

        this._controller = this._connector;
        this._controller.onOpen = stream => {
            this._computeVideoBitrate(abr);
            this.onStart(stream);
        };
        this._controller.onRTPProps = props => {
            this._rtpProps = props;
            this.onRTPProps(props);
        };
        this._controller.onMediaReport = async mediaReport => {
            this._mediaReport = mediaReport;
            this._computeVideoBitrate(abr);
            this.onMediaReport(mediaReport);
        };
        this._controller.onVideoBitrate = (video_bitrate, video_bitrate_constraint) => {
            this._videoBitrate = video_bitrate;
            this._videoBitrateConstraint = video_bitrate_constraint;
            this.onVideoBitrate(video_bitrate, video_bitrate_constraint);
        };
    }

    /**
     * Stop streaming the stream
     * @param error error description on an improper stop
     */
    stop(error?: StreamerError) {
        const connector = this._connector;
        if (!connector) {
            return;
        }
        this._connector = undefined;
        connector.close();
        this._controller = undefined;
        this._mediaReport = undefined;
        this._videoBitrate = undefined;
        this._videoBitrateConstraint = undefined;
        this._rtpProps = undefined;
        // User event (always in last)
        this.onStop(error);
    }

    private _computeVideoBitrate(abr: ABRAbstract) {
        if (!this._controller || this._videoBitrateFixed) {
            return;
        }
        const videoBitrate = abr.compute(this._videoBitrate, this.videoBitrateConstraint, this.mediaReport);
        if (videoBitrate !== this._videoBitrate) {
            this._videoBitrate = videoBitrate;
            this._controller.setVideoBitrate(videoBitrate);
        }
    }
}
