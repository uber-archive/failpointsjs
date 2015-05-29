# failpoints

Add custom probabilistic failure points to your code and control when they execute.

Why? Because sometimes you want to be ready for when things get funky.

### Basic example

```js
var failpoints = require('failpoints').create();
failpoints.set('my_failpoint', {probability: 0.5, maxDurationMs: 100});

if (failpoints.shouldFail('my_failpoint')) {
    // 50-50 chance this will be entered in the next 100ms after setting the failpoint
    // Do things here instead doing your work, perhaps return early too
}

// Do normal things
```

#### Set options

The second argument passed to `set` should be `Boolean` or `Object`.  If `Object` the following keys can be used:

```
probability {Number} - Float between 0-1 with probability on each call to be on or off
maxCount {Number} - Integer of many times at most to invoke as on before reducing to probability 0
maxDurationMs {Number} - Integer of milliseconds to run at most before reducing probability to 0
args {Object} - Arguments to pass to failpoint selection method if provided at failpoint, will also provide to failure method
```

The `set` method will also return `true` if failpoint state set or `false` if problem setting the failpoint.  If `false` you can supply a logger to inspect any errors that might occur trying to set the failpoint:

```js
myFailpointsInstance.logger = {info: ..., warn: ..., error: ...};
```

### Async inline example

```js
var failpoints = require('failpoints').create();

// ...

function getFileContents(file, callback) {
    failpoints.inline('read_file_failpoint', function onShouldFail() {
        // This method will only get called if should fail
        callback(new Error('Synthetic error from failpoint invocation'));

    }, function onNormally() {
        // This method will only get called if shouldn't fail
        fs.readFileSync(file, {encoding: 'utf8'}, callback);

    });
}

getFileContents('./my_file.txt', function onDone(err, contents) {
    // Did get file contents

    failpoints.set('read_file_failpoint', true);

    getFileContents('./my_file.txt', function onDone(err, contents) {
        // Will fail

        // Can turn off further invocations
        failpoints.set('read_file_failpoint', false);
    });
});
```

### Set all on and off

```js
var failpoints = require('failpoints').create();

// setup failpoints

failpoints.setAll(true);
failpoints.setAll({probability: 0.5});
failpoints.setAll(false);

```

### Control failpoints across files and modules with namespaces

somefile.js

```js
var Failpoints = require('failpoints');
var failpoints = Failpoints.getOrCreateFailpointsWithNamespace('myNamespace');

function myMethod() {
    var didFail = failpoints.inlineSync('my_method_failpoint', function onShouldFail() {
        // Do bad things in sync
    });
}
```

otherfile.js

```js
var Failpoints = require('failpoints');
var failpoints = Failpoints.getOrCreateFailpointsWithNamespace('myNamespace');

failpoints.set('my_method_failpoint', {probability: 0.5, maxDurationMs: 3000});
```

You can see the tests for more advanced usages.

## Installation

`npm install failpoints`

## Tests

`npm test`

## MIT Licensed
