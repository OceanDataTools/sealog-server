'use strict';

//const nes = require('nes');
//const Handlers = require('./handlers');

exports.register = function (server, options, next) {

  server.method('publishNewEvent', ( payload ) => {
    server.publish('/ws/status/newEvents', payload );
  });

  server.subscription('/ws/status/newEvents');

  return next();
};

exports.register.attributes = {
  name: 'routes-ws-events',
  dependencies: ['nes']
};