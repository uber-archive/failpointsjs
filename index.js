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

var _ = require('lodash');
var Failpoint = require('./failpoint');
var tryit = require('tryit');
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
    this.logger = null;
    this.stats = null;
}

Failpoints.CONST = CONST;

Failpoints.failpointsByNamespace = new Map();

Failpoints.getOrCreateFailpointsWithNamespace = function getOrCreateFailpointsWithNamespace(namespace) {
    var byNamespace = Failpoints.failpointsByNamespace;
    var failpoints = byNamespace.get(namespace);
    if (!failpoints) {
        tryit(function tryCreateFailpoints() {
            failpoints = new Failpoints({namespace: namespace});
        });
        if (!failpoints) {
            // Exception creating Failpoints instance
            return null;
        }

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
 * @param {String} name - Name of the failpoint to enable/disable
 * @param {Boolean|Object} options - If boolean then turn it completely on or off, otherwise set as options object
 * @returns {Boolean} - True if succesfully set state or false otherwise
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
    var err;
    var statName;
    var msg;

    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        tryit(function tryCreateFailpoint() {
            failpoint = new Failpoint({
                name: name,
                failpoints: self,
                Math: self.Math,
                Date: self.Date
            });
            self.knownFailpoints.set(name, failpoint);
        }, function onDone(exc) {
            err = exc;
            statName = 'lazy_create_failpoint';
            msg = 'Failed to lazily create failpoint';
            self._maybeError(err, statName, msg, {name: name, options: options});
        });
        if (err) {
            return false;
        }
    }

    tryit(function setFailpointState() {
        failpoint.setState(options);
    }, function onDone(exc) {
        err = exc;
    });

    if (err) {
        statName = 'set_state';
        msg = 'Failed to set failpoint state';
        self._error(err, statName, msg, {name: name, options: options});
        return false;
    }

    return true;
};

Failpoints.prototype.setAll = function setAll(options) {
    var self = this;
    var allSetSuccessfully = true;

    self.knownFailpoints.forEach(function eachFailpoint(failpoint, name) {
        var err;
        tryit(function setFailpointState() {
            failpoint.setState(options);
        }, function onDone(exc) {
            err = exc;
        });

        if (err) {
            var statName = 'set_state';
            var msg = 'Failed to set failpoint state';
            self._error(err, statName, msg, {name: name, options: options});
            allSetSuccessfully = false;
        }
    });

    return allSetSuccessfully;
};

Failpoints.prototype.get = function get(name) {
    var self = this;
    var failpoint = self.knownFailpoints.get(name);
    if (failpoint) {
        return failpoint.toJSON();
    }
    return undefined;
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
        self._logWarn('shouldFailConditionally does not have shouldAllow callback set');
        return false;
    }
    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        return false;
    }
    var args = failpoint.args || CONST.NO_ARGS;
    return shouldAllow(args) && failpoint.shouldFail();
};

Failpoints.prototype.inline = function inline(name, onShouldFail, onNormally) {
    var self = this;
    if (typeof onShouldFail !== 'function') {
        self._logWarn('inline does not have onShouldFail callback set');
        return false;
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
        self._logWarn('inlineConditionally does not have onShouldFail callback set');
        return false;
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
        return self._logWarn('inlineSync does not have onShouldFail callback set');
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
        return self._logWarn('inlineSyncConditionally does not have onShouldFail callback set');
    }
    if (self.shouldFailConditionally(name, shouldAllow)) {
        onShouldFail(self.getArgs(name));
        return true;
    } else {
        return false;
    }
};

Failpoints.prototype.getArgs = function getArgs(name) {
    var self = this;
    var failpoint = self.knownFailpoints.get(name);
    if (!failpoint) {
        return undefined;
    }
    return failpoint.args || CONST.NO_ARGS;
};

Failpoints.prototype._maybeError = function maybeError(err, statName, msg, meta) {
    var self = this;
    if (err) {
        self._error(err, statName, msg, meta);
    }
};

Failpoints.prototype._error = function error(err, statName, msg, meta) {
    var self = this;
    if (self.logger && typeof self.logger.error === 'function') {
        var metaWithError = {error: err};
        if (meta) {
            _.extend(metaWithError, meta);
        }
        self.logger.error(msg, metaWithError);
    }
    if (self.stats && typeof self.stats.increment === 'function') {
        self.stats.increment('failpoints_error_' + statName);
    }
};

Failpoints.prototype._logWarn = function log(msg, meta) {
    var self = this;
    if (self.logger && typeof self.logger.warn === 'function') {
        self.logger.warn(msg, meta);
    }
};
