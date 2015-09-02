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

var createFailpoints = require('../').create;
var mockDateTypeWithFixedDateNow = require('./test_utils').mockDateTypeWithFixedDateNow;
var test = require('tape');

test('failpoint setTime, triggerCount and lastTriggered all records correctly', function t(assert) {
    var myFailpointCallCount = 0;

    var failpoints = createFailpoints();
    failpoints.Date = mockDateTypeWithFixedDateNow();

    methodUnderTest();

    failpoints.set('my_failpoint', true);

    methodUnderTest();
    methodUnderTest();

    assert.deepEqual(failpoints.get('my_failpoint'), {
        name: 'my_failpoint',
        probability: 1.0,
        maxCount: null,
        maxDurationMs: null,
        args: null,
        setTime: 1,
        triggerCount: 2,
        lastTriggered: 1
    });

    failpoints.set('my_failpoint', false);

    methodUnderTest();

    assert.equal(myFailpointCallCount, 2);

    assert.equal(failpoints.get('my_failpoint'), undefined);

    assert.end();

    function methodUnderTest() {
        failpoints.inlineSync('my_failpoint', function onShouldFail() {
            myFailpointCallCount++;
        });
    }
});
