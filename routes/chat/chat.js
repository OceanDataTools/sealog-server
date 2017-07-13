'use strict';

//const nes = require('nes');
//const Handlers = require('./handlers');

exports.register = function (server, options, next) {

  const db = server.app.db;
  //const r = server.app.r;
  // server.route({
  //   method: 'GET',
  //   path: '/h',
  //   config: {
  //     id: 'hello',
  //     handler: function (request, reply) {

  //       return reply('world!');
  //     }
  //   }
  // });

  server.method('setupChatUpdates', () => {

    db.table('events').changes().run().then((feed) => {

      feed.each((err, change) => {
        //console.log('Change detected', change);
        server.publish('/chat/updates', change.new_val);
      });

      return null;

    }).catch((err) => {
      throw err;
    });
  }, {
    callback: false
  });

  server.subscription('/chat/updates');

  return next();
};

exports.register.attributes = {
  name: 'routes-chat-chat',
  dependencies: ['db']
};