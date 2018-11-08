'use strict';

const Joi = require('joi');

const {
  eventTemplatesTable,
} = require('../../../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const _renameAndClearFields = (doc) => {

    //rename id
    doc.id = doc._id;
    delete doc._id;

    return doc;
  };

  server.route({
    method: 'GET',
    path: '/event_templates',
    handler: function (request, reply) {

      let limit = (request.query.limit)? request.query.limit : 0;
      let offset = (request.query.offset)? request.query.offset : 0;

      db.collection(eventTemplatesTable).find().skip(offset).limit(limit).toArray().then((results) => {
        // console.log("results:", results);

        if (results.length > 0) {
          results.forEach(_renameAndClearFields);
          return reply(results).code(200);
        } else {
          return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
        }
      }).catch((err) => {
        console.log("ERROR:", err);
        return reply().code(503);
      });      
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        query: Joi.object({
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
        }).optional(),
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.object(),
            event_name: Joi.string(),
            event_value: Joi.string(),
            event_free_text_required: Joi.boolean(),
            system_template: Joi.boolean(),
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

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventTemplatesTable).findOne(query).then((result) => {
        if (!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        result = _renameAndClearFields(result);
        return reply(result).code(200);
      }).catch((err) => {
        console.log("ERROR:", err);
        return reply().code(503);
      });
    },
    config: {
      auth:{
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        params: Joi.object({
          id: Joi.string().length(24).required()
        }),
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          200: Joi.object({
            id: Joi.object(),
            event_name: Joi.string(),
            event_value: Joi.string(),
            event_free_text_required: Joi.boolean(),
            system_template: Joi.boolean(),
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

      if(request.payload.id) {
        try {
          event_template._id = new ObjectID(request.payload.id);
          delete event_template.id;
        } catch(err) {
          console.log("invalid ObjectID");
          return reply({statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters"}).code(400);
        }
      }

      if(!event_template.event_options) {
        event_template.event_options = [];
      }

      if(!event_template.event_free_text_required) {
        event_template.event_free_text_required = false;
      }

      //console.log(event_template);

      db.collection(eventTemplatesTable).insertOne(event_template, (err, result) => {

        if (err) {
          console.log("ERROR:", err);
          return reply().code(503);
        }

        if (!result) {
          return reply({ "statusCode": 400, 'message': 'Bad request'}).code(400);
        }

        return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        payload: {
          id: Joi.string().length(24).optional(),
          event_name: Joi.string().required(),
          event_value: Joi.string().required(),
          event_free_text_required: Joi.boolean().required(),
          system_template: Joi.boolean().required(),
          event_options: Joi.array().items(Joi.object({
            event_option_name: Joi.string().required(),
            event_option_type: Joi.string().required(),
            event_option_default_value: Joi.string().allow("").optional(),
            event_option_values: Joi.array().items(Joi.string()).required(),
            event_option_allow_freeform: Joi.boolean().required(),
            event_option_required: Joi.boolean().required(),
          })).optional(),
        },
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          201: Joi.object({
            n: Joi.number().integer(),
            ok: Joi.number().integer(),
            insertedCount: Joi.number().integer(),
            insertedId: Joi.object()
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

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventTemplatesTable).findOne(query).then((result) => {

        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        db.collection(eventTemplatesTable).updateOne(query, { $set: request.payload }).then((result) => {

          return reply(result).code(204);

        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });
      }).catch((err) => {
        console.log("ERROR:", err);
        return reply().code(503);
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        params: Joi.object({
          id: Joi.string().length(24).required()
        }),
        payload: Joi.object({
          event_name: Joi.string().optional(),
          event_value: Joi.string().optional(),
          event_free_text_required: Joi.boolean().optional(),
          system_template: Joi.boolean().optional(),
          event_options: Joi.array().items(Joi.object({
            event_option_name: Joi.string().required(),
            event_option_type: Joi.string().required(),
            event_option_default_value: Joi.string().allow('').optional(),
            event_option_values: Joi.array().items(Joi.string()).required(),
            event_option_allow_freeform: Joi.boolean().required(),
            event_option_required: Joi.boolean().required(),
          })).optional(),
        }).required().min(1),
        options: {
          allowUnknown: true
        }
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
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_templates/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventTemplatesTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        console.log(typeof(result.system_template));
        console.log(request.auth.credentials.scope);
        if (result.system_template && !request.auth.credentials.scope.includes('admin')) {
          return reply({"statusCode": 401, 'error': 'Unauthorized', 'message': 'user does not have permission to delete system templates'}).code(401);
        }

        db.collection(eventTemplatesTable).deleteOne(query).then((result) => {
          return reply(result).code(204);
        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });

      }).catch((err) => {
        console.log("ERROR:", err);
        return reply().code(503);
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        params: Joi.object({
          id: Joi.string().length(24).required()
        }),
        options: {
          allowUnknown: true
        }
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
  dependencies: ['hapi-mongodb']
};