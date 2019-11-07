"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var path = require('path');

var common = require('karma/lib/middleware/common');

var minimatch = require('minimatch');

var _require = require('./includer.js'),
    includeScriptsIntoContext = _require.includeScriptsIntoContext,
    includeErrorIntoContext = _require.includeErrorIntoContext,
    filePathToUrlPath = _require.filePathToUrlPath;

var _require2 = require('./framework.js'),
    nonIncludedFiles = _require2.nonIncludedFiles,
    REVERSE_CONTEXT = _require2.REVERSE_CONTEXT; // Replicate filesPromise functionality from webServer.
// Unfortunately we can’t access the webServer child DI injector
// from here where the filesPromise lives.


function createFilesPromise(fileList, emitter, basePath) {
  var filesPromise = new common.PromiseContainer(); // Set an empty list of files to avoid race issues with
  // file_list_modified not having been emitted yet

  filesPromise.set(Promise.resolve(fileList.files));
  emitter.on('file_list_modified', function (files) {
    filesPromise.set(Promise.resolve(files));
  });
  return filesPromise;
}

function isIFrameHtml(url) {
  return /\.iframe\.html$/.test(url);
} // Reverse included and served files


function includeServedOnly(files) {
  files = Object.assign({}, files);
  var oldIncluded = files.included;
  files.included = files.served // Don’t include the files that are included in the outer context
  .filter(function (file) {
    return oldIncluded.indexOf(file) === -1;
  }) // Don’t include this (or other) contexts
  .filter(function (file) {
    return !isIFrameHtml(file.path);
  }) // Don’t include files that were never included to begin with (before the framework ran)
  // FIXME: find the most specific applicable pattern first
  .filter(function (file) {
    return !nonIncludedFiles.some(function (pattern) {
      return minimatch(file.originalPath, pattern.pattern);
    });
  }) // Don’t include the reverse context (it is included by the `transform` function below)
  .filter(function (file) {
    return file.originalPath !== REVERSE_CONTEXT;
  });
  return files;
}

function createContextRewriteMiddleware(logger, fileList, emitter, injector) {
  var log = logger.create('middleware:iframes-rewrite');

  function rewrite(res, req, next, transformer) {
    log.debug("Rewriting request to ".concat(req.url, " with ").concat(transformer.displayName || transformer.name));
    var end = res.end; // Monkey-patch res.end to rewrite the response using the transformer passed

    res.end = function endRewritten(chunk) {
      chunk instanceof Buffer && (chunk = chunk.toString());

      try {
        chunk = transformer(chunk, req);
      } catch (e) {
        log.error('failed to apply transformer', e);
      }

      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      end.call.apply(end, [this, chunk].concat(args));
    };

    next();
  }

  var filesPromise = createFilesPromise(fileList, emitter);

  function transform(files, chunk, req) {
    var basePath = injector.get('config.basePath');
    var urlRoot = injector.get('config.urlRoot');
    var upstreamProxy = injector.get('config.upstreamProxy');
    var proxyPath = upstreamProxy ? upstreamProxy.path : '/';
    var reverseContextFile = files.served.find(function (file) {
      return file.originalPath === REVERSE_CONTEXT;
    });

    if (!reverseContextFile.isUrl) {
      reverseContextFile = filePathToUrlPath(reverseContextFile.path, basePath, urlRoot, proxyPath);
    } else {
      reverseContextFile = reverseContextFile.path;
    }

    log.debug("Adding reverse context file ".concat(reverseContextFile, " to chunk ").concat(_typeof(chunk), "(").concat(chunk.length, ")"));
    chunk = chunk.replace('%REVERSE_CONTEXT%', reverseContextFile);
    return includeScriptsIntoContext(includeServedOnly(files), log, injector, chunk, req);
  }

  return function contextRewriteMiddleware(req, res, next) {
    if (!isIFrameHtml(req._parsedUrl.pathname)) {
      return next();
    }

    log.debug("Rewriting script includes in ".concat(req.url));
    filesPromise.then(function (files) {
      rewrite(res, req, next, transform.bind(null, files));
    }, function (errorFiles) {
      debug.error('Could not resolve files', errorFiles);
      rewrite(res, req, next, includeErrorIntoContext.bind(null, errorFiles, log, injector));
    });
  };
}

createContextRewriteMiddleware.$inject = ['logger', 'fileList', 'emitter', 'injector'];
module.exports = createContextRewriteMiddleware;