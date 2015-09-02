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

var Failpoint = require('../failpoint');
var test = require('tape');

test('Failpoint throws when name not set correctly', function t(assert) {
    assert.throws(function tryPassBadName() {
        Failpoint();
    }, /name/);
    assert.end();
});

test('Failpoint.setState throws on bad probability', function t(assert) {
    assert.throws(function tryPassBadProbability() {
        var failpoint = new Failpoint({name: 'test'});
        failpoint.setState({probability: 2.0});
    });
    assert.end();
});

test('Failpoint.setState throws on bad maxCount', function t(assert) {
    assert.throws(function tryPassBadProbability() {
        var failpoint = new Failpoint({name: 'test'});
        failpoint.setState({probability: 1.0, maxCount: -1});
    });
    assert.end();
});

test('Failpoint.setState throws on bad maxDurationMs', function t(assert) {
    assert.throws(function tryPassBadProbability() {
        var failpoint = new Failpoint({name: 'test'});
        failpoint.setState({probability: 1.0, maxDurationMs: -1});
    });
    assert.end();
});

test('Failpoint.setState throws on bad args', function t(assert) {
    assert.throws(function tryPassBadProbability() {
        var failpoint = new Failpoint({name: 'test'});
        failpoint.setState({probability: 1.0, args: 'args'});
    });
    assert.end();
});

test('Failpoint.shouldFail returns true if random() <= probability', function t(assert) {
    function MockMath() { }
    MockMath.random = function mockMathRandom() {
        return 0.2;
    };

    var failpoint = new Failpoint({name: 'test', Math: MockMath});
    failpoint.setState({probability: 0.5});
    assert.equal(failpoint.shouldFail(), true);
    assert.end();
});

test('Failpoint.shouldFail returns false if random() > probability', function t(assert) {
    function MockMath() { }
    MockMath.random = function mockMathRandom() {
        return 0.8;
    };

    var failpoint = new Failpoint({name: 'test', Math: MockMath});
    failpoint.setState({probability: 0.5});
    assert.equal(failpoint.shouldFail(), false);
    assert.end();
});

test('Failpoint.shouldFail returns false if exceeds maxCount', function t(assert) {
    var failpoint = new Failpoint({name: 'test'});
    failpoint.setState({probability: 1.0, maxCount: 1});
    assert.equal(failpoint.shouldFail(), true);
    assert.equal(failpoint.shouldFail(), false);
    assert.end();
});

test('Failpoint.shouldFail returns false if exceeds maxDurationMs', function t(assert) {
    var i = 0;
    var start = Date.now();
    var failpoint = new Failpoint({
        name: 'test',
        Date: {
            now: function mockNow() {
                var value = i++ > 1 ? start + 101 : start;
                return value;
            }
        }
    });
    failpoint.setState({probability: 1.0, maxDurationMs: 100});
    assert.equal(failpoint.shouldFail(), true);
    assert.equal(failpoint.shouldFail(), false);
    assert.end();
});

test('Failpoint.shouldFail returns false through hitMaxLimits fast path if exceeded maxCount', function t(assert) {
    var failpoint = new Failpoint({name: 'test'});
    failpoint.setState({probability: 1.0, maxCount: 1});
    assert.equal(failpoint.shouldFail(), true);
    assert.equal(failpoint.shouldFail(), false);
    assert.equal(failpoint.hitMaxLimits, true);
    assert.equal(failpoint.shouldFail(), false);
    assert.end();
});
