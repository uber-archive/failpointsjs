// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';
/* eslint max-len: 0, max-statements: 0 */

module.exports = Failpoint;

var EventEmitter = require('events').EventEmitter;
var robb = require('robb/src/robb');
var util = require('util');

function Failpoint(options) {
    options = options || {};

    if (typeof options.name !== 'string') {
        throw new Error('Requires `name` as string');
    }

    this.name = options.name;
    this.failpoints = options.failpoints;
    this.Math = options.Math || Math;
    this.Date = options.Date || Date;
    this.probability = 0.0;
    this.maxCount = null;
    this.maxDurationMs = null;
    this.args = null;
    this.setTime = null;
    this.triggerCount = null;
    this.lastTriggered = null;
    this.hitMaxLimits = false;
}

util.inherits(Failpoint, EventEmitter);

Failpoint.prototype.toJSON = function toJSON() {
    var self = this;
    return {
        name: self.name,
        probability: self.probability,
        maxCount: self.maxCount,
        maxDurationMs: self.maxDurationMs,
        args: self.args,
        setTime: self.setTime,
        triggerCount: self.triggerCount,
        lastTriggered: self.lastTriggered
    };
};

Failpoint.prototype.setState = function setState(options) {
    /* eslint complexity: 0 */
    var self = this;
    if (typeof options === 'boolean') {
        if (options) {
            self.probability = 1.0;
        } else {
            self.probability = 0.0;
        }
        self.maxCount = null;
        self.maxDurationMs = null;
        self.args = null;
        return self._resetStatsVars();
    }

    if (!options ||
        typeof options.probability !== 'number' ||
        !(options.probability >= 0.0 && options.probability <= 1.0)) {
        throw new Error('`options.probability` not between 0.0 to 1.0');
    }

    if (options.maxCount !== null &&
        options.maxCount !== undefined &&
        (!robb.isInt(options.maxCount) || options.maxCount <= 0)) {
        throw new Error('`options.maxCount` not an integer greater than 0');
    }

    if (options.maxDurationMs !== null &&
        options.maxDurationMs !== undefined &&
        (typeof options.maxDurationMs !== 'number' || options.maxDurationMs <= 0)) {
        throw new Error('`options.maxDurationMs` not a duration greater than 0ms');
    }

    if (options.args !== null &&
        options.args !== undefined &&
        (typeof options.args !== 'object' ||
        !Array.isArray(Object.keys(options.args)))) {
        throw new Error('`options.args` not an object with at least 1 key');
    }

    self.probability = options.probability;
    self.maxCount = options.maxCount || null;
    self.maxDurationMs = options.maxDurationMs || null;
    self.args = options.args || null;
    self._resetStatsVars();
};

Failpoint.prototype._resetStatsVars = function resetStatsVars() {
    var self = this;
    self.hitMaxLimits = false;
    if (self.probability > 0.0) {
        self.emit('active', self);
        self.setTime = self.Date.now();
        self.triggerCount = 0;
        self.lastTriggered = null;
    } else {
        self.emit('inactive', self);
        self.setTime = null;
        self.triggerCount = null;
        self.lastTriggered = null;
    }
};

Failpoint.prototype.shouldFail = function shouldFail() {
    var self = this;

    if (self.hitMaxLimits) {
        // Fast path for avoiding counts & times
        return false;
    }

    if (self.maxCount !== null && self.triggerCount >= self.maxCount) {
        // Cache hitting the max count limit
        self.hitMaxLimits = true;
        self.emit('inactive', self);
        return false;
    }

    if (self.maxDurationMs !== null && (self.Date.now() - self.setTime) > self.maxDurationMs) {
        // Cache hitting the max duration limit
        self.hitMaxLimits = true;
        self.emit('inactive', self);
        return false;
    }

    var didPassProbabilityTest = false;
    if (self.probability === 1.0 || self.Math.random() <= self.probability) {
        didPassProbabilityTest = true;
    }

    if (!didPassProbabilityTest) {
        return false;
    }

    self.triggerCount++;
    self.lastTriggered = self.Date.now();

    return true;
};
