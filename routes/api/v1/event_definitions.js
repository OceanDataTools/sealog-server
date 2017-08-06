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

// Event Definition Record
// {
//   id: uuid, // id of the event definition
//   event_name: string, // name of the event definition
//   event_value: string, // value of the event text
//   event_free_text_required: bool, // whether to require user to add free text
//   event_options: {
//     event_option_name: string, // name of the event option
//     event_option_type: string, // the type of the event option (dropdown, scale, etc)
//     event_option_default_value: string, // default value for the option
//     event_option_values: [ string ], // list of acceptable values
//     event_option_allow_freeform: boolean // whether to allow the option to be manually entered (vs require text to be selected from a strict list)
//     event_option_required: boolean // whether completing this option is required for submission.
//   }
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
    path: '/event_definitions',
    handler: function (request, reply) {

      let query = db.table('event_definitions');

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
            event_name: Joi.string(),
            event_value: Joi.string(),
            event_free_text_required: Joi.boolean(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_type: Joi.string(),
              event_option_default_value: Joi.string().allow(''),
              event_option_values: Joi.array().items(Joi.string()),
              event_option_allow_freeform: Joi.boolean(),
              event_option_required: Joi.boolean(),
            })),
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
      description: 'Return the event definitions based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_definitions','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_definitions/{id}',
    handler: function (request, reply) {

      let query = db.table('event_definitions').get(request.params.id);

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
            event_name: Joi.string(),
            event_value: Joi.string(),
            event_free_text_required: Joi.boolean(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_type: Joi.string(),
              event_option_default_value: Joi.string().allow(''),
              event_option_values: Joi.array().items(Joi.string()),
              event_option_allow_freeform: Joi.boolean(),
              event_option_required: Joi.boolean(),
            })),
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
      description: 'Return the event definitions based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_definitions','auth','api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/event_definitions',
    handler: function (request, reply) {

      let event_definition = request.payload;

      if(!event_definition.event_options) {
        event_definition.event_options = [];
      }

      if(!event_definition.event_free_text_required) {
        event_definition.event_free_text_required = false;
      }

      //console.log(event);

      db.table('event_definitions').insert(event_definition).run().then((result) => {
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
          event_name: Joi.string().required(),
          event_value: Joi.string().required(),
          event_free_text_required: Joi.boolean().required(),
          event_options: Joi.array().items(Joi.object({
            event_option_name: Joi.string().required(),
            event_option_type: Joi.string().required(),
            event_option_default_value: Joi.string().allow("").optional(),
            event_option_values: Joi.array().items(Joi.string()).required(),
            event_option_allow_freeform: Joi.boolean().required(),
            event_option_required: Joi.boolean().required(),
          })).optional(),
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

      description: 'Create a new event definition',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_definitions','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_definitions/{id}',
    handler: function (request, reply) {

      db.table('event_definitions').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        let event_definition = request.payload;

        db.table("event_definitions").get(request.params.id).update(event_definition).run().then(() => {
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
          event_name: Joi.string().optional(),
          event_value: Joi.string().optional(),
          event_free_text_required: Joi.boolean().optional(),
          event_options: Joi.array().items(Joi.object({
            event_option_name: Joi.string().required(),
            event_option_type: Joi.string().required(),
            event_option_default_value: Joi.string().allow('').optional(),
            event_option_values: Joi.array().items(Joi.string()).required().min(1),
            event_option_allow_freeform: Joi.boolean().required(),
            event_option_required: Joi.boolean().required(),
          })).optional(),
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
      description: 'Update a event definition record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_definitions','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_definitions/{id}',
    handler: function (request, reply) {

      db.table('event_definitions').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.table('event_definitions').get(request.params.id).delete().run().then(() => {

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
      description: 'Delete an event definitions record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'event_definitions','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_definitions',
  dependencies: ['db']
};