// Event Record
// {
//  "id": "uuid",
//  "user_name": "user_name",
//  "ts": "timestamp",
//   "event_value": "string"
//   "event_options": [{
//     "event_option_name": "option_name",
//     "event_option_value": "option_value"
//   }],
//   "event_free_text": "string",
// }

// Event Templates Record
// {
//   id: uuid, // id of the event template
//   event_template_name: string, // name of the event template
//   event_templates: [
//     event_template_id (uuid),
//     ...
//   ]
// }

'use strict';

//const uuid = require('uuid');
const Joi = require('joi');
//const Boom = require('boom');

exports.register = function (server, options, next) {

  const db = server.app.db;
  //const r = server.app.r;

  server.route({
    method: 'GET',
    path: '/event_templates',
    handler: function (request, reply) {

      let query = db.table('event_templates');

      //console.log(request.query);

      //Offset filtering
      if (request.query.offset) {
        query = query.skip(request.query.offset);
      } 

      //Limit filtering
      if (request.query.limit) {
        query = query.limit(request.query.limit);
      } 

      //console.log(query.toString());

      query.run().then((result) =>{

        if (result.length > 0) {
          return reply(result).code(200);
        } else {
          return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
        }
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        query: Joi.object({
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
        }).optional()
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.string().uuid(),
            event_template_name: Joi.string(),
            event_definitions: Joi.array().items(Joi.string()),
          })),
          400: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          })
        }
      },
      description: 'Return the event templates based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_templates/{id}',
    handler: function (request, reply) {

      let query = db.table('event_templates').get(request.params.id);

      query.run().then((result) => {
        if (!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        return reply(result).code(200);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth:{
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        })
      },
      response: {
        status: {
          200: Joi.object({
            id: Joi.string().uuid(),
            event_template_name: Joi.string(),
            event_definitions: Joi.array().items(Joi.string()),
          }),
          400: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          404: Joi.object({
            statusCode: Joi.number().integer(),
            message: Joi.string()
          })
        }
      },
      description: 'Return the event templates based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/event_templates',
    handler: function (request, reply) {

      let event_template = request.payload;

      //console.log(event);

      db.table('event_templates').insert(event_template).run().then((result) => {
        return reply(result).code(201);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        payload: {
          event_template_name: Joi.string().required(),
          event_definitions: Joi.array().items(Joi.string()).required().min(1),
        }
      },
      response: {
        status: {
          201: Joi.object({
            deleted: Joi.number().integer(),
            errors: Joi.number().integer(),
            generated_keys: Joi.array().items(Joi.string().uuid()),
            inserted: Joi.number().integer(),
            replaced: Joi.number().integer(),
            skipped: Joi.number().integer(),
            unchanged: Joi.number().integer(),
          }),
          400: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          })
        }
      },

      description: 'Create a new event template',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_templates/{id}',
    handler: function (request, reply) {

      db.table('event_templates').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        let event_template = request.payload;

        db.table("event_templates").get(request.params.id).update(event_template).run().then(() => {
          return reply().code(204);
        }).catch((err) => {
          throw err;
        });
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        }),
        payload: Joi.object({
          event_template_name: Joi.string().optional(),
          event_definitions: Joi.array().items(Joi.string()).optional(),
        }).required().min(1)
      },
      response: {
        status: {
          400: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          })
        }
      },
      description: 'Update a event template record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_templates/{id}',
    handler: function (request, reply) {

      db.table('event_templates').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.table('event_templates').get(request.params.id).delete().run().then(() => {

          db.table('event_aux_data').filter({'event_id': request.params.id}).delete().run().then(() => {
      
            return reply().code(204);
      
          }).catch((err) => {
            throw err;
          });
        
        }).catch((err) => {
          throw err;
        });

      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        })
      },
      response: {
        status: {
          400: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          })
        }
      },
      description: 'Delete an event templates record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'event_templates','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_templates',
  dependencies: ['db']
};