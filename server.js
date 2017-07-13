'use strict';

const Glue = require('glue');
const Labbable = require('labbable');

const labbable = module.exports = new Labbable();
const manifest = require('./config/manifest');

if (process.env.NODE_ENV) { // NOT PRODUCTION

  manifest.registrations.push({
    plugin: './plugins/db_testing',
    options: {
      select: ['api', 'chat']
    }
  });

  if(process.env.NODE_ENV == 'development') { // DEVELOPMENT

    manifest.registrations.push({
      "plugin": {
        "register": "blipp",
        "options": {}
      }
    });
    
//  } else if(process.env.NODE_ENV == 'testing') { // TESTING
  
  }

// } else { // PRODUCTION

}

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

      server.methods.setupChatUpdates();

//      console.log(server);
      console.log('✅  API Server is listening on ' + server.select('api').info.uri.toLowerCase());
      console.log('✅  Chat Server is listening on ' + server.select('chat').info.uri.toLowerCase());
    });
  });
});