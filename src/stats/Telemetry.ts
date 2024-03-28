/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { ILog, WebSocketReliable, EventEmitter, Util } from '@ceeblue/web-utils';
import { IStats } from './IStats';

/**
 * Use Telemetry to report statistics from an {@link IStats} object
 * at a regular interval to a WebSocket or HTTP server.
 * @example
 * // Streamer statistics reporting to a websocket SSL server with a frequency of 1 second
 * const telemetry = new Telemetry('wss://address/metrics');
 * telemetry.report(new StreamerStats(streamer), 1);
 */
export class Telemetry extends EventEmitter implements ILog {
    /**
     * @override{@inheritDoc ILog.onLog}
     * @event
     */
    onLog(log: string) {}

    /**
     * @override{@inheritDoc ILog.onError}
     * @event
     */
    onError(error: string = 'unknown') {
        console.error(error);
    }

    /**
     * URL of connection
     */
    get url(): string {
        return this._url;
    }

    /**
     * Number of current reports
     */
    get reporting(): number {
        return this._reporting.size;
    }

    private _ws?: WebSocketReliable;
    private _fetchController?: AbortController;
    private _url: string;
    private _reporting: Map<IStats, number | NodeJS.Timeout>;

    /**
     * Build a metrics reporter configured with a URL, which can be a websocket or http server.
     * You must call {@link report} to start reporting metrics.
     * If you call {@link report} with the same {@link IStats} instance, it will udptate this report.
     *
     * @param url a Websocket or HTTP server URL.
     */
    constructor(url: string | URL) {
        super();
        url = new URL(url);
        if (url.protocol.startsWith('ws')) {
            this._ws = new WebSocketReliable();
        } else if (!url.protocol.startsWith('http')) {
            throw Error('Protocol ' + url.protocol + ' not supported');
        }
        this._url = url.toString();
        this._reporting = new Map();
    }

    /**
     *  Starts reporting metrics from an {@link IStats} instance to the URL end-point
     * @param stats {@link IStats} implementation
     * @param frequency set report interval (in seconds), if it is undefined it reports only one time the stats, if it is 0 it stops the reporting
     */
    report(stats: IStats, frequency?: number) {
        stats.onError = (error: string) => this.onError(stats.constructor.name + ' error, ' + error);
        stats.onLog = (log: string) => this.onLog(stats.constructor.name + ', ' + log);

        const stop = () => {
            const timer = this._reporting.get(stats);
            if (timer == null) {
                return;
            }
            this.onLog('Stop ' + stats.constructor.name + ' reporting');

            clearInterval(timer);
            stats.off('release', stop);
            this._reporting.delete(stats);

            // Cleanup if no more stats to report after this call
            setTimeout(() => {
                if (this._reporting.size > 0) {
                    return;
                }
                if (this._ws) {
                    this._ws.close();
                }
                if (this._fetchController) {
                    this._fetchController.abort();
                }
            }, 0);
        };

        // stop sending if already reporting
        stop();

        // start sending if required
        if (frequency == null) {
            this._report(stats);
            this.onLog('Send ' + stats.constructor.name + ' report');
            return;
        } else if (frequency > 0) {
            const timer = setInterval(() => this._report(stats), frequency * 1000);
            this._reporting.set(stats, timer);
            stats.on('release', stop);
            this.onLog('Start ' + stats.constructor.name + ' reporting every ' + frequency + ' seconds');
        }
    }

    private async _report(stats: IStats) {
        try {
            await this._send(stats);
        } catch (e) {
            this.onError(stats.constructor.name + ' error, ' + Util.stringify(e));
        }
    }

    private async _send(stats: IStats) {
        let data;
        try {
            data = await stats.serialize();
        } catch (e) {
            if (!e) {
                return;
            } // wait to be ready!
            throw e;
        }
        let body: string | ArrayBuffer;
        let mimeType;
        if (data instanceof ArrayBuffer) {
            mimeType = 'application/octet-stream';
            body = data;
        } else if (typeof data == 'string') {
            mimeType = 'text/plain';
            body = data;
        } else {
            mimeType = 'application/json';
            body = JSON.stringify(data);
        }

        if (this._ws) {
            // WEBSOCKET
            if (this._ws.closed) {
                // Open websocket when required!
                this._ws.open(this._url);
            }
            this._ws.queueing.length = 0; // erase the queueing stats if present!
            this._ws.send(body);
        } else {
            // HTTP
            if (this._fetchController) {
                // abort previous stats sending
                this._fetchController.abort();
            }
            this._fetchController = new AbortController();
            fetch(this._url, {
                method: 'POST',
                body,
                headers: {
                    'Content-Type': mimeType
                },
                signal: this._fetchController.signal
            });
        }
    }
}
