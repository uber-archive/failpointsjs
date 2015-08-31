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

module.exports = Failpoints;

/* eslint-disable */
var Map = require('es6-map');
/* eslint-enable */

var Failpoint = require('./failpoint');
var Individual = require('individual');
var UUID = require('uuid');

var CONST = {};
CONST.DEFAULT_NAMESPACE = 'DEFAULT_NAMESPACE';
CONST.NO_ARGS = Object.freeze({});
CONST = Object.freeze(CONST);

function Failpoints(options) {
    options = options || {};

    if (typeof options.namespace !== 'string') {
        throw new Error('Requires `namespace` as string');
    }

    this.namespace = options.namespace;
    this.knownFailpoints = new Map();
    this.Math = options.Math || Math;
    this.Date = options.Date || Date;
}

Failpoints.CONST = CONST;

Failpoints.failpointsByNamespace = Individual('__FAILPOINTS_BY_NAMESPACE', new Map());

Failpoints.getOrCreateFailpointsWithNamespace = function getOrCreateFailpointsWithNamespace(namespace) {
    var byNamespace = Failpoints.failpointsByNamespace;
    var failpoints = byNamespace.get(namespace);
    if (!failpoints) {
        failpoints = new Failpoints({namespace: namespace});
        byNamespace.set(namespace, failpoints);
    }
    return failpoints;
};

Failpoints.getFailpointsWithDefaultNamespace = function getFailpointsWithDefaultNamespace() {
    return Failpoints.getOrCreateFailpointsWithNamespace(CONST.DEFAULT_NAMESPACE);
};

Failpoints.createWithNamespace = function createWithNamespace(namespace) {
    return this.getOrCreateFailpointsWithNamespace(namespace);
};

Failpoints.create = function createUntracked() {
    return new Failpoints({namespace: 'Failpoints-' + UUID.v4()});
};

/**
 * Set a failpoint's state. Can either be a registered failpoint or not-yet-registered failpoint.
 *
 * Will throw on bad options.
 *
 * @param {String} name - Name of the failpoint to enable/disable
 * @param {Boolean|Object} options - If boolean then turn it completely on or off, otherwise set as options object
 */
Failpoints.prototype.set = function set(name, options) {
    /*
     * options:
     *  probability {Number} Float between 0-1 with probability on each call to be on or off
     *  maxCount {Number} Integer of many times at most to invoke as on before reducing to probability 0
     *  maxDurationMs {Number} Integer of milliseconds to run at most before reducing probability to 0
     *  args {Object} Arguments to pass to failpoint selection method if provided at failpoint
     */
    var self = this;

    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        failpoint = new Failpoint({
            name: name,
            failpoints: self,
            Math: self.Math,
            Date: self.Date
        });
        self.knownFailpoints.set(name, failpoint);
    }

    failpoint.setState(options);
};

/**
 * Set all known failpoints' state.
 *
 * Will throw on bad options.
 *
 * @param {Boolean|Object} options - If boolean then turn it completely on or off, otherwise set as options object
 */
Failpoints.prototype.setAll = function setAll(options) {
    var self = this;
    self.knownFailpoints.forEach(function eachFailpoint(failpoint, name) {
        failpoint.setState(options);
    });
};

Failpoints.prototype.get = function get(name) {
    var self = this;
    var failpoint = self.knownFailpoints.get(name);
    if (failpoint) {
        return failpoint.toJSON();
    }
    return undefined;
};

Failpoints.prototype.getArgs = function getArgs(name) {
    var self = this;
    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        return undefined;
    }
    return failpoint.args || CONST.NO_ARGS;
};

Failpoints.prototype.shouldFail = function shouldFail(name) {
    var self = this;
    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        return false;
    }
    return failpoint.shouldFail();
};

Failpoints.prototype.shouldFailConditionally = function shouldFailConditionally(name, shouldAllow) {
    var self = this;
    if (typeof shouldAllow !== 'function') {
        throw new Error('shouldFailConditionally does not have shouldAllow callback set');
    }
    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        return false;
    }
    var args = failpoint.args || CONST.NO_ARGS;
    // Explicitly check hitMaxLimits first to avoid
    // potentially expensive shouldAllow function call
    return !failpoint.hitMaxLimits && shouldAllow(args) && failpoint.shouldFail();
};

Failpoints.prototype.inline = function inline(name, onShouldFail, onNormally) {
    var self = this;
    if (typeof onShouldFail !== 'function') {
        throw new Error('inline does not have onShouldFail callback set');
    }
    if (self.shouldFail(name)) {
        onShouldFail(self.getArgs(name));
        return true;
    } else if (typeof onNormally === 'function') {
        onNormally();
        return false;
    } else {
        return false;
    }
};

Failpoints.prototype.inlineConditionally = function inlineConditionally(name, shouldAllow, onShouldFail, onNormally) {
    var self = this;
    if (typeof onShouldFail !== 'function') {
        throw new Error('inlineConditionally does not have onShouldFail callback set');
    }
    if (self.shouldFailConditionally(name, shouldAllow)) {
        onShouldFail(self.getArgs(name));
        return true;
    } else if (typeof onNormally === 'function') {
        onNormally();
        return false;
    } else {
        return false;
    }
};

Failpoints.prototype.inlineSync = function inlineSync(name, onShouldFail) {
    var self = this;
    if (typeof onShouldFail !== 'function') {
        throw new Error('inlineSync does not have onShouldFail callback set');
    }
    if (self.shouldFail(name)) {
        onShouldFail(self.getArgs(name));
        return true;
    } else {
        return false;
    }
};

Failpoints.prototype.inlineSyncConditionally = function inlineSyncConditionally(name, shouldAllow, onShouldFail) {
    var self = this;
    if (typeof onShouldFail !== 'function') {
        throw new Error('inlineSyncConditionally does not have onShouldFail callback set');
    }
    if (self.shouldFailConditionally(name, shouldAllow)) {
        onShouldFail(self.getArgs(name));
        return true;
    } else {
        return false;
    }
};
