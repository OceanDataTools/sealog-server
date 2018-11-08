'use strict';
const Joi = require('joi');

const IMAGE_ROUTE = "/sealog-images/{param*}";
const IMAGE_PATH = "/Users/webbpinner/sealog-images";

exports.register = function (server, options, next) {

  server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
      return reply({ result: 'Welcome to sealog-server!' });
    },
    config: {
      description: 'This is default route for the API.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - request successful</div>\
        <div class="panel-body">Returns simple message</div>\
      </div>',
      response: {
        status: {
          200: Joi.object({
            result: "Welcome to sealog-server!"
          })
        }
      },
      tags: ['default','test'],
    }
  });

  server.route({
    method: 'GET',
    path: '/restricted',
    handler: function (request, reply) {

      //if(request.auth.isAuthenticated){
      //  console.log("       User associated with JWT is:", request.auth.credentials.name);
      //}
      return reply({message: 'Ok, You are authorized.'}).code(200);
    },
    config: {
      description: 'This is default route for testing restricted routes.',
      auth: {
        strategy: 'jwt',
        scope: 'admin'
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        options: {
          allowUnknown: true
        }
      },
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - request successful</div>\
        <div class="panel-body">Returns JSON object for user record</div>\
      </div>\
      <div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 401</strong> - authentication failed</div>\
        <div class="panel-body">Returns JSON object explaining error</div>\
      </div>',
      response: {
        status: {
          200: Joi.object({
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          })
        }
      },
      tags: ['default','test','auth'],
    }
  });

  server.route({
    method: 'GET',
    path: IMAGE_ROUTE,
    handler: {
      directory: {
        path: IMAGE_PATH
      }
    },
    config: {
      description: 'This route is used for serving image files for cameras.'
    }
  });

  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: function (request, reply) {
      return reply({ message: 'Oops, 404 Page!' }).code(404);
    },
    config: {
      description: 'This is the route used for handling invalid routes.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 404</strong> - file not found</div>\
        <div class="panel-body">Returns JSON object explaining error</div>\
      </div>',
      response: {
        status: {
          404: Joi.object({
            message: "Oops, 404 Page!"
          })
        }
      },
      tags: ['default','test'],
    }
  });

  server.route({
    method: 'GET',
    path: '/server_time',
    handler: function (request, reply) {
      let timestamp = new Date();
      // console.log(timestamp)
      return reply({ ts: timestamp }).code(200);
    },
    config: {
      description: 'This is the route used for retrieving the current server time.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - success</div>\
        <div class="panel-body">Returns JSON object containing the current server time (UTC)</div>\
      </div>',
      response: {
        status: {
          200: Joi.object({
            ts: Joi.date().iso(),
          })
        }
      },
      tags: ['default','test'],
    }
  });

  return next();

};

exports.register.attributes = {
  name: 'routes-default',
//  dependencies: []
};
