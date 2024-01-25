/**
 * Copyright 2023 Ceeblue B.V.
 * This file is part of https://github.com/CeeblueTV/webrtc-client which is released under GNU Affero General Public License.
 * See file LICENSE or go to https://spdx.org/licenses/AGPL-3.0-or-later.html for full license details.
 */

import { Queue } from './Queue';

/**
 * A collection of number Queue<number> with the following efficient mathematic computation:
 * - minimum value in the collection
 * - maximum value in the collection
 * - average value of the collection
 */
export class Numbers extends Queue<number> {
    /**
     * minimum value in the collection, or 0 if colleciton is empty
     */
    get minimum(): number {
        return this._min;
    }

    /**
     * maximum value in the collection, or 0 if colleciton is empty
     */
    get maximum(): number {
        return this._max;
    }

    /**
     * average value of the collection, or 0 if collection if empty
     */
    get average(): number {
        if (this._average == null) {
            this._average = this.size ? this._sum / this.size : 0;
        }
        return this._average;
    }

    private _average?: number;
    private _sum: number = 0;
    private _min: number = 0;
    private _max: number = 0;
    /**
     * Instantiate the collection of the number
     * @param capacity if set it limits the number of values stored, any exceding number pops the first number pushed (FIFO)
     */
    constructor(capacity?: number) {
        super(capacity);
    }

    /**
     * Push a value to the back to the collection
     * @param value number to add
     * @returns this
     */
    push(value: number): Numbers {
        if (value > this._max) {
            this._max = value;
        } else if (value < this._min) {
            this._min = value;
        }
        this._average = undefined;
        this._sum += value;
        super.push(value);
        return this;
    }

    /**
     * Pop the front number from the collection
     * @returns the front number removed
     */
    pop(): number | undefined {
        const front = super.pop();
        if (front === this._max) {
            this._max = Math.max(0, ...this);
        } else if (front === this._min) {
            this._min = Math.min(0, ...this);
        }
        this._average = undefined;
        this._sum -= front || 0;
        return front;
    }

    /**
     * Clear all the numbers, collection becomes empty
     * @returns this
     */
    clear() {
        this._min = this._max = this._sum = 0;
        super.clear();
        return this;
    }
}
