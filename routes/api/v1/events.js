'use strict';

const Joi = require('joi');

const {
  eventsTable,
  usersTable,
  eventAuxDataTable
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
    path: '/events',
    handler: function (request, reply) {

      let query = {};

      // console.log(request.query);

      //Data source filtering
      if (request.query.datasource) {

        let datasource_query = {};

        if(Array.isArray(request.query.datasource)) {
          datasource_query.data_source  = { $in: request.query.datasource };
        } else {
          datasource_query.data_source  = request.query.datasource;
        }

        db.collection(eventAuxDataTable).find(datasource_query, {_id: 0, event_id: 1}).toArray().then((collection) => {

          let eventIDs = collection.map(x => x.event_id);

          // console.log("collection:", eventIDs);

          query._id = { $in: eventIDs};


          if(request.query.author) {
            if(Array.isArray(request.query.author)) {
              query.event_author  = { $in: request.query.author };
            } else {
              query.event_author  = request.query.author;
            }
          }

          if(request.query.value) {
            if(Array.isArray(request.query.value)) {
              query.event_value  = { $in: request.query.value };
            } else {
              query.event_value  = request.query.value;
            }
          }

          if(request.query.freetext) {

            query.event_free_text = { $regex: `${request.query.freetext}`};
          }

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

            query.ts = {"$gte": startTS , "$lte": stopTS };
          }

          let limit = (request.query.limit)? request.query.limit : 0;
          let offset = (request.query.offset)? request.query.offset : 0;

          // console.log("query:", query);

          db.collection(eventsTable).find(query).sort( { ts: 1 } ).skip(offset).limit(limit).toArray().then((results) => {
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
        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });
      } else {

        if(request.query.author) {
          if(Array.isArray(request.query.author)) {
            query.event_author  = { $in: request.query.author };
          } else {
            query.event_author  = request.query.author;
          }
        }

        if(request.query.value) {
          if(Array.isArray(request.query.value)) {
            query.event_value  = { $in: request.query.value };
          } else {
            query.event_value  = request.query.value;
          }
        }

        if(request.query.freetext) {

          query.event_free_text = { $regex: `${request.query.freetext}`};
        }

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

          query.ts = {"$gte": startTS , "$lte": stopTS };
        }

        let limit = (request.query.limit)? request.query.limit : 0;
        let offset = (request.query.offset)? request.query.offset : 0;

        // console.log("query:", query);

        db.collection(eventsTable).find(query).sort( { ts: 1  } ).skip(offset).limit(limit).toArray().then((results) => {
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
      }
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
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
          author: Joi.alternatives().try(
            Joi.string(),
            Joi.array().items(Joi.string()).optional()
          ),
          startTS: Joi.date().iso(),
          stopTS: Joi.date().iso(),
          datasource: Joi.alternatives().try(
            Joi.string(),
            Joi.array().items(Joi.string()).optional()
          ),
          value: Joi.alternatives().try(
            Joi.string(),
            Joi.array().items(Joi.string()).optional()
          ),
          freetext: Joi.alternatives().try(
            Joi.string(),
            Joi.array().items(Joi.string()).optional()
          ),
        }).optional(),
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.object(),
            event_author: Joi.string(),
            ts: Joi.date().iso(),
            event_value: Joi.string(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_value: Joi.string()
            })),
            event_free_text: Joi.string().allow(''),
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
      description: 'Return the events based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
      tags: ['events','auth', 'api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/events/{id}',
    handler: function (request, reply) {

      let query = { _id: ObjectID(request.params.id) };

      db.collection(eventsTable).findOne(query).then((result) => {
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
            event_author: Joi.string(),
            ts: Joi.date().iso(),
            event_value: Joi.string(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_value: Joi.string()
            })),
            event_free_text: Joi.string().allow(''),
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
      description: 'Return the events based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
      tags: ['events','auth','api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/events',
    handler: function (request, reply) {

      let event = request.payload;

      if(request.payload.id) {
        try {
          event._id = new ObjectID(request.payload.id)
          delete event.id
        } catch(err) {
          console.log("invalid ObjectID")
          return reply({statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters"}).code(400)
        }
      }

      if(!event.ts) {
        event.ts = new Date();
      }

      if(!event.event_options) {
        event.event_options = [];
      }

      if(!event.event_free_text) {
        event.event_free_text = "";
      }

      if(!event.event_author) {
        db.collection(usersTable).findOne({_id: new ObjectID(request.auth.credentials.id)}, (err, result) => {

          if(err) {
            console.log("ERROR:", err);
            return reply().code(503);
          }

          if (!result) {
            return reply({ "statusCode": 401, 'message': 'No user found for id: ' + request.params.id }).code(404);
          }

          event.event_author = result.username;

          db.collection(eventsTable).insertOne(event, (err, result) => {

            if (err) {
              console.log("ERROR:", err);
              return reply().code(503);
            }

            if (!result) {
              return reply({ "statusCode": 400, 'message': 'Bad request'}).code(400);
            }

            event = _renameAndClearFields(event);
            server.methods.publishNewEvent(event);

            return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
          });
        });
      } else {

        db.collection(eventsTable).insertOne(event, (err, result) => {

          if (err) {
            console.log("ERROR:", err);
            return reply().code(503);
          }

          if (!result) {
            return reply({ "statusCode": 400, 'message': 'Bad request'}).code(400);
          }

          return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
        });
      }
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
          event_author: Joi.string().min(1).max(100).optional(),
          ts: Joi.date().iso().optional(),
          event_value: Joi.string().min(1).max(100).required(),
          event_options: Joi.array().items(Joi.object({
            event_option_name:Joi.string().required(),
            event_option_value:Joi.string().required()
          })).optional(),
          event_free_text: Joi.string().allow('').optional()
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

      description: 'Create a new event',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['events','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/events/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventsTable).findOne(query).then((result) => {

        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        if(request.payload.event_options) {
          request.payload.event_options.forEach((requestOption) => {
            let foundit = false;
            result.event_options.forEach((resultOption) => {
              if(resultOption.event_option_name == requestOption.event_option_name) {
                resultOption.event_option_value = requestOption.event_option_value;
                foundit = true;
              }
            });

            if (!foundit) {
              result.event_options.push(requestOption);
            }
          });
        }

        db.collection(eventsTable).updateOne(query, { $set: request.payload }).then((result) => {

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
          event_author: Joi.string().min(1).max(100).optional(),
          ts: Joi.date().iso().optional(),
          event_value: Joi.string().min(1).max(100).optional(),
          event_options: Joi.array().items(Joi.object({
            event_option_name:Joi.string().required(),
            event_option_value:Joi.string().required()
          })).optional(),
          event_free_text: Joi.string().optional()
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
      description: 'Update a event record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['events','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/events/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventsTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.collection(eventsTable).deleteOne(query).then((result) => {
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
      description: 'Delete an events record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'events','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-events',
  dependencies: ['hapi-mongodb']
};
