/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/**
 * A advanced EventEmitter which allows to declare event as natural function in the inheriting children class,
 * function must start by `on` prefix to be recognized as an event.
 * The function can define a behavior by default, and user can choose to redefine this behavior,
 * or add an additionnal subscription for this event.
 * In addition you can unsubscribe to multiple events with an `AbortController`
 * @example
 * class Logger extends EventEmitter {
 *    onLog(log:string) { console.log(log); } // behavior by default
 *
 *    test() {
 *       // raise event onLog
 *       this.onLog('test');
 *    }
 * }
 *
 * const logger = new Logger();
 * logger.test(); // displays a log 'test'
 *
 * // redefine default behavior to display nothing
 * logger.onLog = () => {}
 * logger.test(); // displays nothing
 *
 * // add an additionnal subscription
 * logger.on('log', console.log);
 * logger.test(); // displays a log 'test'
 *
 * // remove the additionnal subscription
 * logger.off('log', console.log);
 * logger.test(); // displays nothing
 *
 * // add two additionnal subscriptions with a AbortController
 * const controller = new AbortController();
 * logger.on('log', log => console.log(log), controller);
 * logger.on('log', log => console.error(log), controller);
 * logger.test(); // displays a log 'test' + an error 'test'
 *
 * // Unsubscribe all the subscription with the AbortController
 * controller.abort();
 * logger.test(); // displays nothing
 */
export class EventEmitter {
    private _events: Map<string, Set<Function>>;

    /**
     * Build our EventEmitter, usually call from children class
     */
    constructor() {
        this._events = new Map();
        // Fill events with events as defined!
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== Object.prototype) {
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (name.length < 3 || !name.startsWith('on')) {
                    continue;
                }
                if (proto[name] instanceof Function) {
                    const events = new Set<Function>();
                    this._events.set(name.substring(2).toLowerCase(), events);
                    let defaultEvent = proto[name];
                    Object.defineProperties(this, {
                        [name]: {
                            get:
                                () =>
                                (...args: unknown[]) => {
                                    // Call default event if not null (can happen in JS usage)
                                    if (defaultEvent) {
                                        defaultEvent.call(this, ...args);
                                    }
                                    // Call subscribers
                                    for (const event of events) {
                                        event(...args);
                                    }
                                },
                            set: (value: Function | undefined) => {
                                // Assign a default behavior!
                                defaultEvent = value;
                            }
                        }
                    });
                }
            }
            proto = Object.getPrototypeOf(proto);
        }
    }

    /**
     * Event subscription
     * @param name Name of event without the `on` prefix (ex: `log` to `onLog` event declared)
     * @param event Subscriber Function
     * @param abort Optional `AbortController` to stop this or multiple subscriptions in same time
     */
    on(name: string, event: Function, abort?: AbortController) {
        if (!event) {
            throw Error('event to subscribe cannot be null');
        }
        const events = this._event(name);
        events.add(event);
        if (abort) {
            abort.signal.addEventListener('abort', () => {
                events.delete(event);
            });
        }
    }

    /**
     * Event subscription only one time, once time fired it's automatically unsubscribe
     * @param name Name of event without the `on` prefix (ex: `log` to `onLog` event declared)
     * @param event Subscriber Function
     * @param abort Optional `AbortController` to stop this or multiple subscriptions in same time
     */
    once(name: string, event: Function, abort?: AbortController) {
        if (!event) {
            throw Error('event to subscribe cannot be null');
        }
        const events = this._event(name);
        events.add(() => {
            events.delete(event); // delete from events
            event(); // execute event
        });
        if (abort) {
            abort.signal.addEventListener('abort', () => {
                events.delete(event);
            });
        }
    }

    /**
     * Event unsubscription
     * @param name Name of event without the 'on' prefix (ex: 'log' to 'onLog' event declared)
     * @param event Unsubscriber Function, must be the one passed to {@link on} or {@link once} subscription methods
     */
    off(name: string, event: Function) {
        if (!event) {
            throw Error('event to unsubscribe cannot be null');
        }
        this._event(name).delete(event);
    }

    private _event(name: string): Set<Function> {
        const events = this._events.get(name.toLowerCase());
        if (!events) {
            throw Error('No event on' + name + ' on class ' + this.constructor.name);
        }
        return events;
    }
}
