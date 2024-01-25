/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

/**
 * Queue typed similar to a {@link https://en.cppreference.com/w/cpp/container/queue | std::queue<Type>} with possibility to limit the capacity like a FIFO
 * @example
 * const queue = new Queue<number>(2);
 * queue.push(1); // [1]
 * queue.push(2); // [1,2]
 * queue.push(3); // [2,3] 1 has been removed to respect 2 capacity
 */
export class Queue<Type> {
    /**
     * Number of element in the queue
     */
    get size(): number {
        return this._queue.length;
    }

    /**
     * Maximum capacity for the queue, if not set queue has unlimited capacity
     */
    get capacity(): number | undefined {
        return this._capacity;
    }

    /**
     * Set a maximum capacity for the queue,
     * if you push new value exceding this capacity the firsts are removed (FIFO)
     * if set to undefined the queue is unlimited
     */
    set capacity(value: number | undefined) {
        this._capacity = value;
        if (value != null && this._queue.length > value) {
            this._queue.splice(0, this._queue.length - value);
        }
    }

    /**
     * The front element
     */
    get front(): Type {
        return this._queue[0];
    }

    /**
     * The back element
     */
    get back(): Type {
        return this._queue[this._queue.length - 1];
    }

    /**
     * Iterator though queue's elements
     */
    [Symbol.iterator](): IterableIterator<Type> {
        return this._queue[Symbol.iterator]();
    }

    private _capacity?: number;
    private _queue: Array<Type>;
    /**
     * Instanciate a new queue object with the type passed as template
     * @param capacity if set it limits the size of the queue, any exceding element pops the first element pushed (FIFO)
     */
    constructor(capacity?: number) {
        this._capacity = capacity;
        this._queue = new Array<Type>();
    }

    /**
     * Push a new element in the queue
     * @param value value of the element
     * @returns this
     */
    push(value: Type): Queue<Type> {
        if (this._capacity != null && this._queue.push(value) > this._capacity) {
            this.pop();
        }
        return this;
    }

    /**
     * Pop the first element from the queue
     * @returns The first element removed
     */
    pop(): Type | undefined {
        return this._queue.shift();
    }

    /**
     * Clear all the elements, queue becomes empty
     * @returns this
     */
    clear(): Queue<Type> {
        this._queue.length = 0;
        return this;
    }
}
