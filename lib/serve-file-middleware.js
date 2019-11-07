"use strict";

var fs = require('fs');

var common = require('karma/lib/middleware/common');

var TMP_STATIC_FILES_DIR = require('tmp').dirSync().name;

var STATIC_PREFIX = '/iframes-static/';

function createStaticFileMiddleware(logger, injector) {
  var log = logger.create('middleware:iframes-serve-file');
  var config = injector.get('config');
  var serveFile = common.createServeFile(fs, null, config);
  return function staticFileMiddleware(req, res, next) {
    if (req.url.indexOf(STATIC_PREFIX) !== 0) {
      return next();
    }

    var file = "".concat(TMP_STATIC_FILES_DIR, "/").concat(req._parsedUrl.pathname.substr(STATIC_PREFIX.length));
    log.debug("Searching for file to ".concat(req.url, " in ").concat(file));
    fs.stat(file, function (err, stats) {
      if (err) {
        log.error("fs.stat(".concat(file, ") errored with"), err);
      }

      if (err || !stats.isFile()) {
        log.debug("No match found for ".concat(file));
        return next(err);
      }

      var rangeHeader = req.headers['range'];
      fs.readFile(file, function (err, data) {
        serveFile(file, rangeHeader, res, function () {
          if (/\?\w+/.test(req.url)) {
            // files with timestamps - cache one year, rely on timestamps
            common.setHeavyCacheHeaders(res);
          } else {
            // without timestamps - no cache (debug)
            common.setNoCacheHeaders(res);
          }
        }, data, true);
      });
    });
  };
}

createStaticFileMiddleware.$inject = ['logger', 'injector'];
module.exports = {
  TMP_STATIC_FILES_DIR: TMP_STATIC_FILES_DIR,
  STATIC_PREFIX: STATIC_PREFIX,
  createStaticFileMiddleware: createStaticFileMiddleware
};