'use strict';

const Joi = require('joi');

const {
  loweringsTable,
} = require('../../../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const _renameAndClearFields = (doc) => {

    //rename id
    doc.id = doc._id;
    delete doc._id;
    // delete doc.event_id;

    // if(doc.aux_data && doc.aux_data.length > 0) {
    //   doc.aux_data.forEach(_renameAndClearFields);
    // }

    return doc;
  };

  server.route({
    method: 'GET',
    path: '/lowerings',
    handler: function (request, reply) {

      let query = {};

      //Time filtering
      if ((request.query.startTS) || (request.query.stopTS)) {
        let startTS = new Date("1970-01-01T00:00:00.000Z");
        let stopTS = new Date();

        if (request.query.startTS) {
          startTS = new Date(request.query.startTS);
        }

        if (request.query.stopTS) {
          stopTS = new Date(request.query.stopTS);
        }

        query.ts = {"$gte": startTS , "$lt": stopTS };
      }

      let limit = (request.query.limit)? request.query.limit : 0;
      let offset = (request.query.offset)? request.query.offset : 0;

      db.collection(loweringsTable).find(query).skip(offset).limit(limit).toArray().then((results) => {
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
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        query: Joi.object({
          startTS: Joi.date().iso(),
          stopTS: Joi.date().iso(),
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
            lowering_id: Joi.string().allow(''),
            // start_ts: Joi.date().iso(),
            // stop_ts: Joi.date().iso(),
            lowering_description: Joi.string().allow(''),
            lowering_location: Joi.string().allow(''),
            lowering_pilot: Joi.string().allow(''),
            lowering_observers: Joi.array().items(Joi.string().allow('')),
            // lowering_tags: Joi.array().items(Joi.string().allow('')),
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
      description: 'Return the lowerings based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['lowerings','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/lowerings/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(loweringsTable).findOne(query).then((result) => {
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
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
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
            lowering_id: Joi.string().allow(''),
            // start_ts: Joi.date().iso(),
            // stop_ts: Joi.date().iso(),
            lowering_description: Joi.string().allow(''),
            lowering_pilot: Joi.string().allow(''),
            lowering_observers: Joi.array().items(Joi.string().allow('')),
            // lowering_tags: Joi.array().items(Joi.string().allow('')),
            lowering_location: Joi.string().allow(''),
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
      description: 'Return the lowering based on lowering id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['lowerings','auth','api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/lowerings',
    handler: function (request, reply) {

      let lowering = request.payload;

      if(request.payload.id) {
        try {
          lowering._id = new ObjectID(request.payload.id);
          delete lowering.id;
        } catch(err) {
          console.log("invalid ObjectID");
          return reply({statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters"}).code(400);
        }
      }

      db.collection(loweringsTable).insertOne(lowering, (err, result) => {

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
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        payload: {
          id: Joi.string().length(24).optional(),
          lowering_id: Joi.string().allow('').required(),
          start_ts: Joi.date().iso().optional(), // tweaked for alvin
          stop_ts: Joi.date().iso().optional(),  // tweaked for alvin
          lowering_description: Joi.string().allow('').required(),
          lowering_location: Joi.string().allow('').required(),
          lowering_pilot: Joi.string().allow('').required(),
          lowering_observers: Joi.array().items(Joi.string().allow('')).required(),
          lowering_tags: Joi.array().items(Joi.string().allow('')).optional() // tweaked for alvin
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
        <p>Available to: <strong>admin</strong></p>',
      tags: ['lowerings','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/lowerings/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(loweringsTable).findOne(query).then((result) => {

        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        db.collection(loweringsTable).updateOne(query, { $set: request.payload }).then((result) => {

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
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        params: Joi.object({
          id: Joi.string().length(24).required()
        }),
        payload: Joi.object({
          lowering_id: Joi.string().optional(),
          start_ts: Joi.date().iso().optional(),
          stop_ts: Joi.date().iso().optional(),
          lowering_description: Joi.string().allow('').optional(),
          lowering_pilot: Joi.string().allow('').optional(),
          lowering_observers: Joi.array().items(Joi.string().allow('')).optional(),
          lowering_tags: Joi.array().items(Joi.string().allow('')).optional(),
          lowering_location: Joi.string().allow('').optional(),
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
      description: 'Update a lowering record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['lowerings','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/lowerings/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(loweringsTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.collection(loweringsTable).deleteOne(query).then((result) => {
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
        scope: ['admin']
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
      description: 'Delete a lowering record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: [ 'lowerings','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/lowerings/all',
    handler: function (request, reply) {

      let query = { };

      db.collection(loweringsTable).deleteMany(query).then((result) => {
        return reply(result).code(204);
      }).catch((err) => {
        console.log("ERROR:", err);
        return reply().code(503);
      });

    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
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
      description: 'Delete a lowering record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: [ 'lowerings','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-lowerings',
  dependencies: ['hapi-mongodb']
};