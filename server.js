'use strict';

const Glue = require('glue');
const Labbable = require('labbable');

const labbable = module.exports = new Labbable();
const manifest = require('./config/manifest');

Glue.compose(manifest, { relativeTo: __dirname }, (err, server) => {

  if (err) {
    throw err;
  }

  labbable.using(server);

  server.initialize((err) => {

    if (err) {
      throw err;
    }

    // Don't continue to start server if module
    // is being require()'d (likely in a test)
    if (module.parent) {
      return;
    }

    server.start((err) => {

      if (err) {
        throw err;
      }

//      console.log(server);
      console.log('✅  API Server is listening on ' + server.select('api').info.uri.toLowerCase());
      console.log('✅  WS Server is listening on ' + server.select('ws').info.uri.toLowerCase());
    });
  });
});