# failpoints

Add custom probabilistic and conditional failure points to your code and control when they execute.

Why? Because sometimes you want to be ready for when things get funky.

## Motivation

Failpoints becomes useful when there are many libraries and components that compose a piece of software and you want to namespace each one and toggle them on remotely.

## Example

Dynamically set failpoints in your request handlers and also toggle on embedded library failpoints.

Your server:

```js
var Failpoints = require('failpoints');
var myServiceFailpoints = Failpoints.createWithNamespace('my-service');
var libraryThatUsesFailpoints = require('library-name');
var http = require('http');
var request = require('request');

var server = http.createServer(function onRequest(req, res) {
    if (myServiceFailpoints.shouldFail('all_requests')) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({error: 'Failing on purpose'}));
    }

    libraryThatUsesFailpoints.doWork(req, function onWorkDone(err, result) {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
    });
});
server.listen(8080);

// Dynamically update failpoints by asking for installed failpoints for this service
var since = 0;
setInterval(function pollForFailpoints() {
    request({
        uri: 'http://cfgsrv/failpoints?service=my-service&since=' + since,
        json: true
    }, onResponse(err, res, body) {
        if (err) {
            return console.error('Error: ' + err);
        }

        // Example response that fails all requests 20% of 
        // the time and the library work 50% of the time:
        // {
        //   "since": 1432928157,
        //   "set": {
        //     "my-service": [
        //       {
        //         "name": "all_requests",
        //         "options": {
        //           "probability": 0.2,
        //           "maxDurationMs": 1000
        //         }
        //       }
        //     ],
        //     "library-name": [
        //       {
        //         "name": "all_work",
        //         "options": {
        //           "probability": 0.5,
        //           "maxDurationMs": 1000
        //         }
        //       }
        //     ]
        //   }
        // }

        since = body.now;

        Object.keys(body.set).forEach(function eachNamespace(namespace) {
            var failpoints = Failpoints.getOrCreateFailpointsWithNamespace(namespace);
            var array = body.set[namespace];
            array.forEach(function eachFailpointToSet(failpoint) {
                failpoints.set(failpoint.name, failpoint.options);
            });
        });
    });
}, 60000);
```

## Usage

### Basic

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
