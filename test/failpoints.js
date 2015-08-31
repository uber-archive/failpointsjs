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
/* eslint max-len: 0 */

var Failpoints = require('../');
var mockDateTypeWithFixedDateNow = require('./test_utils').mockDateTypeWithFixedDateNow;
var test = require('tape');
var UUID = require('uuid');

test('Failpoints throws when name not set correctly', function t(assert) {
    assert.throws(function tryPassBadName() {
        Failpoints();
    }, /name/);
    assert.end();
});

test('Failpoints.getOrCreateFailpointsWithNamespace can lazy create namespace', function t(assert) {
    var uuid = UUID.v4();
    assert.ok(Failpoints.getOrCreateFailpointsWithNamespace('lazy' + uuid));
    assert.end();
});

test('Failpoints.getOrCreateFailpointsWithNamespace can get created namespace', function t(assert) {
    var uuid = UUID.v4();
    var created = Failpoints.getOrCreateFailpointsWithNamespace('created' + uuid);
    assert.ok(created);
    var retrieved = Failpoints.getOrCreateFailpointsWithNamespace('created' + uuid);
    assert.equal(retrieved, created);
    assert.end();
});

test('Failpoints.get can get failpoint as JSON', function t(assert) {
    var mockDate = mockDateTypeWithFixedDateNow();
    var failpoints = new Failpoints({
        namespace: 'test',
        Date: mockDate
    });
    failpoints.set('my_failpoint', {
        probability: 0.5,
        maxDurationMs: 100
    });
    assert.deepEqual(failpoints.get('my_failpoint'), {
        name: 'my_failpoint',
        probability: 0.5,
        maxCount: null,
        maxDurationMs: 100,
        args: null,
        setTime: mockDate.now(),
        triggerCount: 0,
        lastTriggered: null
    });
    assert.end();
});

test('Failpoints.get returns undefined for unknown failpoint', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    assert.equal(failpoints.get('missing_failpoint'), undefined);
    assert.end();
});

test('Failpoints.getArgs returns args for failpoint', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    var args = {my: 'args'};
    failpoints.set('my_failpoint', {
        probability: 1.0,
        maxDurationMs: 100,
        args: args
    });
    assert.deepEqual(failpoints.getArgs('my_failpoint'), {my: 'args'});
    assert.end();
});

test('Failpoints.getArgs returns undefined for unknown failpoint', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    assert.equal(failpoints.getArgs('missing_failpoint'), undefined);
    assert.end();
});

test('Failpoints.shouldFailConditionally returns empty args object if no args to shouldAllow', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.set('my_failpoint', {probability: 1.0});
    var result = failpoints.shouldFailConditionally('my_failpoint', function shouldAllow(args) {
        assert.deepEqual(args, {});
        return true;
    });
    assert.equal(result, true);
    assert.end();
});

test('Failpoints.shouldFailConditionally throws on shouldAllow not set', function t(assert) {
    assert.throws(function tryPassBadShouldAllow() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.shouldFailConditionally('my_failpoint');
    });
    assert.end();
});

test('Failpoints.shouldFailConditionally returns false on unknown failpoint', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    assert.equal(failpoints.shouldFailConditionally('my_failpoint', shouldAllow), false);
    assert.end();

    function shouldAllow() {
        return true;
    }
});

test('Failpoints.shouldFailConditionally returns false on failpoint that has truthy hitMaxLimits', function t(assert) {
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.set('my_failpoint', {probability: 1.0, maxCount: 1});
    failpoints.shouldFailConditionally('my_failpoint', shouldAllow);
    failpoints.shouldFailConditionally('my_failpoint', shouldAllow);
    assert.equal(failpoints.shouldFailConditionally('my_failpoint', shouldAllow), false);
    assert.end();

    function shouldAllow() {
        return true;
    }
});

test('Failpoints.inline calls onNormally when set', function t(assert) {
    var onNormallyCallCount = 0;
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.inline('my_failpoint', function shouldAllow() {
        return true;
    }, function onNormally() {
        onNormallyCallCount++;
    });
    assert.equal(onNormallyCallCount, 1);
    assert.end();
});

test('Failpoints.inline throws on onShouldFail not set', function t(assert) {
    assert.throws(function tryPassBadonShouldFail() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.inline('my_failpoint');
    });
    assert.end();
});

test('Failpoints.inlineConditionally returns false when should fail without onNormallyCallCount', function t(assert) {
    var onShouldFailCallCount = 0;
    var failpoints = new Failpoints({namespace: 'test'});
    var result = failpoints.inlineConditionally('my_failpoint', function shouldAllow() {
        return true;
    }, function onShouldFail() {
        onShouldFailCallCount++;
    });
    assert.equal(result, false);
    assert.equal(onShouldFailCallCount, 0);
    assert.end();
});

test('Failpoints.inlineConditionally calls onShouldFail when set', function t(assert) {
    var onShouldFailCallCount = 0;
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.set('my_failpoint', {probability: 1.0});
    failpoints.inlineConditionally('my_failpoint', function shouldAllow() {
        return true;
    }, function onShouldFail() {
        onShouldFailCallCount++;
    });
    assert.equal(onShouldFailCallCount, 1);
    assert.end();
});

test('Failpoints.inlineConditionally throws on onShouldFail not set', function t(assert) {
    assert.throws(function tryPassBadonShouldFail() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.inlineConditionally('my_failpoint');
    });
    assert.end();
});

test('Failpoints.inlineSync throws on onShouldFail not set', function t(assert) {
    assert.throws(function tryPassBadonShouldFail() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.inlineSync('my_failpoint');
    });
    assert.end();
});

test('Failpoints.inlineSyncConditionally calls onShouldFail when should fail', function t(assert) {
    var onShouldFailCallCount = 0;
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.set('my_failpoint', {probability: 1.0});
    failpoints.inlineSyncConditionally('my_failpoint', function shouldAllow() {
        return true;
    }, function onShouldFail() {
        onShouldFailCallCount++;
    });
    assert.equal(onShouldFailCallCount, 1);
    assert.end();
});

test('Failpoints.inlineSyncConditionally does not call onShouldFail when should not fail', function t(assert) {
    var onShouldFailCallCount = 0;
    var failpoints = new Failpoints({namespace: 'test'});
    failpoints.inlineSyncConditionally('my_failpoint', function shouldAllow() {
        return true;
    }, function onShouldFail() {
        onShouldFailCallCount++;
    });
    assert.equal(onShouldFailCallCount, 0);
    assert.end();
});

test('Failpoints.inlineSyncConditionally throws on onShouldFail not set', function t(assert) {
    assert.throws(function tryPassBadonShouldFail() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.inlineSyncConditionally('my_failpoint');
    });
    assert.end();
});

test('Failpoints.inlineSyncConditionally throws on onShouldFail not set', function t(assert) {
    assert.throws(function tryPassBadonShouldFail() {
        var failpoints = new Failpoints({namespace: 'test'});
        failpoints.inlineSyncConditionally('my_failpoint');
    });
    assert.end();
});
