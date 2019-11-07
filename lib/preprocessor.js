"use strict";

var fs = require('fs');

var TEMPLATE = fs.readFileSync(require.resolve('karma/static/context.html'), {
  encoding: 'utf-8'
});

var _require = require('./serve-file-middleware.js'),
    TMP_STATIC_FILES_DIR = _require.TMP_STATIC_FILES_DIR,
    STATIC_PREFIX = _require.STATIC_PREFIX;

function IFramePreprocessor(logger) {
  var log = logger.create('preprocessor:iframes');
  return function handleFile(content, file, done) {
    log.debug("Processing ".concat(file.path, " to be loaded separately into iframe")); // Add matchable suffix to identify (and for correct mime-typing)
    // Avoid renaming the file multiple times after a watch-reload

    file.path = "".concat(file.contentPath ? file.path : file.originalPath, ".iframe.html");
    var transformedFilePath = file.originalPath.replace(/(\/|\\)/g, '_') + '.js';
    var template = TEMPLATE // Add token that the middleware can replace with the path to the reverse-context.js script
    .replace('src="context.js"', "src=\"%REVERSE_CONTEXT%\"") // Inline the test script into the page
    // FIXME: This does not preserve the script order but inserts the script always at the end
    .replace('%SCRIPTS%', "\n%SCRIPTS%\n<script type=\"text/javascript\" src=\"".concat(STATIC_PREFIX).concat(transformedFilePath, "\"></script>\n")); // Save the file contents to the temp dir for serving it later

    fs.writeFile("".concat(TMP_STATIC_FILES_DIR, "/").concat(transformedFilePath), content, function (err) {
      if (err) {
        log.error('Error writing file befor transformation', err);
      }

      done(template);
    });
  };
}

IFramePreprocessor.$inject = ['logger'];
module.exports = IFramePreprocessor;