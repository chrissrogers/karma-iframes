"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

// jshint es3: false
// jshint esversion: 6
(function (karma) {
  'use strict';

  var isDebug = document.location.href.indexOf('debug.html') > -1;

  function Suite(path, showTitle) {
    // state is one of
    // • 'pending' (before the total is known)
    // • 'started' (after total is known but before all suites have executed)
    // • 'complete' (when total === finished)
    this.state = 'pending';
    this.fileName = path.match(/\/([^/]+)\.iframe\.html$/)[1];
    this.path = path;
    this.iframe = document.createElement('iframe');
    this.wrapper = document.createElement('span');
    this.showTitle = showTitle;
    this.total = NaN;
    this.finished = 0;
  }

  Suite.prototype.init = function (suites) {
    var _this = this;

    if (isDebug) {
      console.debug("Loaded suite ".concat(this.fileName));
    }

    var suite = this; // Add the suite as pending

    suites[this.path] = suite;
    var iframe = this.iframe; // Remap console

    iframe.addEventListener('DOMContentLoaded', function () {
      iframe.contentWindow.console = console;
    }, false); // Listen to messages from the iFrame

    this.messageListener = function (msg) {
      if (!msg.source || iframe.contentWindow !== msg.source) {
        return; // ignore messages from other iframes
      } // Provide some namespace for the message


      if (!Array.isArray(msg.data) || msg.data[0] !== 'iframe-test-results') {
        return;
      }

      var message = msg.data[1];
      var arg = msg.data[2];

      if (message === 'started') {
        _this.started(arg);
      } else if (message === 'result') {
        _this.result(arg);
      } else if (message === 'complete') {
        _this.complete(arg);
      } else {
        // Other message (log, error); send directly to karma
        var args = msg.data.slice(2).map(function (arg) {
          if (_typeof(arg) === 'object' && '@@_serializedErrorFromIFrame' in arg) {
            var newError = new Error(arg.message);
            newError.name = arg.name;
            newError.stack = arg.stack;
            return newError;
          }

          return arg;
        });
        karma[message].apply(karma, args);
      }
    };

    window.addEventListener('message', this.messageListener, false);
  };

  Suite.prototype.run = function () {
    if (isDebug) {
      console.debug("Running suite ".concat(this.fileName));
    }

    if (this.showTitle) {
      this.wrapper.style["float"] = 'left';
      this.wrapper.innerHTML = this.fileName + '<br>';
    }

    this.wrapper.appendChild(this.iframe);
    this.iframe.src = this.path;
    document.body.appendChild(this.wrapper);
  };

  Suite.prototype.started = function (total) {
    if (isDebug) {
      console.debug("Suite ".concat(this.fileName, " has started, expects ").concat(total, " tests"));
    }

    this.state = 'started';
    this.total = total;
    suiteStarted();
  };

  Suite.prototype.result = function (result) {
    if (isDebug) {
      console.debug("Suite ".concat(this.fileName, " has a result, ").concat(result));
    }

    result.suite = result.suite || [];
    result.suite.unshift(this.fileName.replace(/\.iframe\.html$/, ''));
    result.id = this.fileName + '#' + (result.id || '');
    this.finished++;
    sendResult(result);
  };

  Suite.prototype.complete = function (result) {
    if (isDebug) {
      console.debug("Suite ".concat(this.fileName, " has completed with ").concat(this.finished, " of ").concat(this.total, " tests"));
    }

    this.state = 'complete';
    suiteComplete(result);
    this.onComplete();
    this.cleanup();
  };

  Suite.prototype.onComplete = function () {};

  Suite.prototype.cleanup = function () {
    this.iframe.parentNode.removeChild(this.iframe);
    this.wrapper.parentNode.removeChild(this.wrapper);
    window.removeEventListener('message', this.messageListener, false);
    this.iframe = null;
    this.wrapper = null;
    this.messageListener = null;
  }; // Map suite files to suite instances


  var suites = {};

  function suitesWithState(state) {
    var isNeg = state[0] === '!';

    if (isNeg) {
      state = state.substr(1);
    }

    var result = {};
    Object.keys(suites).filter(function (path) {
      return isNeg ? suites[path].state !== state : suites[path].state === state;
    }).forEach(function (path) {
      result[path] = suites[path];
    });
    return result;
  }

  ;

  function countTests() {
    return Object.keys(suites).map(function (path) {
      return suites[path];
    }).reduce(function (_ref, suite) {
      var _ref2 = _slicedToArray(_ref, 2),
          total = _ref2[0],
          finished = _ref2[1];

      total += suite.total;
      finished += suite.finished;
      return [total, finished];
    }, [0, 0]);
  }

  function hasPendingSuites() {
    var startedSuites = suitesWithState('!pending');
    return Object.keys(startedSuites).length < Object.keys(suites).length;
  }

  var pendingResults = [];

  function sendResult(result) {
    if (hasPendingSuites()) {
      // We should not send results to karma before all suites have started, queue them
      pendingResults.push(result);
      return;
    } // Send result directly


    karma.result(result);
  } // Some suite has started


  function suiteStarted() {
    // Have all suites started?
    if (hasPendingSuites()) {
      return;
    } // All suites have started, send the total to karma


    var _countTests = countTests(),
        _countTests2 = _slicedToArray(_countTests, 2),
        total = _countTests2[0],
        finished = _countTests2[1];

    if (isDebug) {
      console.debug("All ".concat(Object.keys(suites).length, " suites have started, expecting ").concat(total, " tests (of which ").concat(finished, " have already finished)"));
    }

    karma.info({
      total: total
    }); // Send the pending results

    pendingResults.forEach(sendResult);
    pendingResults = [];
  } // Some suite has completed


  function suiteComplete(result) {
    if (result.coverage) {
      coverageCollector.addCoverage(result.coverage);
    } // Have all suites completed?


    var completedSuites = suitesWithState('complete');

    if (Object.keys(completedSuites).length < Object.keys(suites).length) {
      return;
    } // All suites have completed, send the “complete” message to karma


    if (isDebug) {
      var _countTests3 = countTests(),
          _countTests4 = _slicedToArray(_countTests3, 2),
          total = _countTests4[0],
          finished = _countTests4[1];

      console.debug("All ".concat(Object.keys(suites).length, " suites have completed, ran ").concat(finished, " of ").concat(total, " tests"));
    }

    if (result.coverage) {
      result.coverage = coverageCollector.getFinalCoverage();
    }

    karma.complete(result);
  }

  function start() {
    // jshint validthis: true
    var files = Object.keys(karma.files).filter(function (file) {
      return file.match(/\.iframe\.html$/);
    });
    var concurrency = parseInt(karma.config.concurrency, 10) || 10;
    var showFrameTitle = karma.config.showFrameTitle || false;
    var ran = 0;
    var preparedSuites = [];
    preparedSuites = files.map(function (file) {
      var suite = new Suite(file, showFrameTitle);
      suite.init(suites);
      return suite;
    });

    if (isDebug) {
      var debugLinks = document.createElement('div');
      preparedSuites.forEach(function (suite) {
        var link = document.createElement('a');
        link.href = suite.path;
        link.target = '_blank';
        link.style.display = 'block';
        link.appendChild(document.createTextNode(suite.fileName));
        debugLinks.appendChild(link);
      });
      document.body.insertBefore(debugLinks, document.body.firstChild);
    }

    preparedSuites.reverse();

    function runNextSuite() {
      var suite = preparedSuites.pop();

      if (!suite) {
        return;
      }

      suite.onComplete = function () {
        ran--;
        runNextSuite();
      };

      suite.run();
      ran++;

      if (ran < concurrency) {
        setTimeout(runNextSuite, 0);
      }
    }

    runNextSuite();
  } //
  // Helper to collect coverages from each suite
  // (supports only one coverage format)
  //


  var coverageCollector = {
    coverages: [],
    addCoverage: function addCoverage(coverage) {
      this.coverages.push(coverage);
    },
    getFinalCoverage: function getFinalCoverage() {
      var coverages = this.coverages;
      return coverages.length ? this.mergeCoverages(coverages) : null;
    },
    mergeCoverages: function mergeCoverages(coverages) {
      var mergedCoverage = {},
          collector = this;
      coverages.forEach(function (coverageBySrc) {
        Object.keys(coverageBySrc).forEach(function (srcKey) {
          if (!(srcKey in mergedCoverage)) {
            mergedCoverage[srcKey] = collector.dirtyClone(coverageBySrc[srcKey]);
            return;
          }

          var masterCoverage = mergedCoverage[srcKey],
              coverage = coverageBySrc[srcKey]; // b - branches,

          ['b'].forEach(function (prop) {
            if (!coverage[prop]) {
              return;
            }

            Object.keys(coverage[prop]).forEach(function (branch) {
              if (!coverage[prop][branch]) {
                return;
              }

              (masterCoverage[prop][branch] || []).forEach(function (value, index) {
                masterCoverage[prop][branch][index] += (coverage[prop][branch] || [])[index] || 0;
              });
            });
          }); // f - functions, s - statements

          ['f', 's'].forEach(function (prop) {
            Object.keys(masterCoverage[prop]).forEach(function (index) {
              masterCoverage[prop][index] += (coverage[prop] || [])[index] || 0;
            });
          });
        });
      });
      return mergedCoverage;
    },
    dirtyClone: function dirtyClone(object) {
      return JSON.parse(JSON.stringify(object));
    }
  };
  karma.start = start;
})(window.__karma__);