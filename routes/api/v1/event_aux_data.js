'use strict';

const Joi = require('joi');

const {
  eventAuxDataTable,
  eventsTable,
  loweringsTable,
  cruisesTable
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
    path: '/event_aux_data/bycruise/{id}',
    handler: function (request, reply) {

      db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) }).then((cruise) => {

        if(cruise.cruise_hidden && !request.auth.credentials.scope.includes("admin")) {
          return reply({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden cruises"}).code(401);
        }

        let query = {};
        let startTS = new Date(cruise.start_ts);
        let stopTS = new Date(cruise.stop_ts);

        let eventQuery = {};

        if(request.query.author) {
          if(Array.isArray(request.query.author)) {
            eventQuery.event_author  = { $in: request.query.author };
          } else {
            eventQuery.event_author  = request.query.author;
          }
        }

        if(request.query.value) {
          if(Array.isArray(request.query.value)) {

            let inList = [];
            let ninList = [];

            for( let value of request.query.value ) {
              if(value.startsWith("!")) {
                ninList.push(value.substr(1));
              } else {
                inList.push(value);
              }
            }
            
            if( inList.length > 0 && ninList.length > 0) {
              eventQuery.event_value  = { $in: inList, $nin: ninList };
            } else if (inList.length > 0) {
              eventQuery.event_value  = { $in: inList };
            } else {
              eventQuery.event_value  = { $nin: ninList };
            }

          } else {
            if(request.query.value.startsWith("!")) {
              eventQuery.event_value  = { $ne: request.query.value.substr(1) };
            } else {
              eventQuery.event_value  = request.query.value;
            }
          }
        }

        if(request.query.freetext) {

          eventQuery.event_free_text = { $regex: `${request.query.freetext}`};
        }

        //Time filtering
        if (request.query.startTS) {
          let tempStartTS = new Date(request.query.startTS);
          // console.log("tempStartTS:", tempStartTS);
          startTS = (tempStartTS >= startTS && tempStartTS <= stopTS)? tempStartTS : startTS;
          // console.log("startTS:", startTS);
        }

        if (request.query.stopTS) {
          let tempStopTS = new Date(request.query.stopTS);
          // console.log("tempStopTS:", tempStopTS);
          stopTS = (tempStopTS >= startTS && tempStopTS <= stopTS)? tempStopTS : stopTS;
          // console.log("stopTS:", stopTS);
        }

        // eventQuery.ts = {"$gte": startTS , "$lte": stopTS };

        let limit = (request.query.limit)? request.query.limit : 0;
        let offset = (request.query.offset)? request.query.offset : 0;

        // console.log("eventQuery:", eventQuery);

        db.collection(eventsTable).find(eventQuery, { _id: 1 }).skip(offset).limit(limit).toArray().then((results) => {

          // EventID Filtering
          if(results.length > 0) {
            // console.log("results:", results);
            let eventIDs = results.map((event) => {
              // console.log(event._id);
              return event._id;
            });
            query.event_id = { $in: eventIDs };

            // Datasource Filtering
            if(request.query.datasource) {
              if(Array.isArray(request.query.datasource)) {
                query.data_source  = { $in: request.query.datasource };
              } else {
                query.data_source  = request.query.datasource;
              }
            }

            // Limiting & Offset
            let limit = (request.query.limit)? request.query.limit : 0;
            let offset = (request.query.offset)? request.query.offset : 0;

            // console.log("query:", query);

            db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray().then((results) => {

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
          } else {
            return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
          }
        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });
      }).catch((err) => {
        console.log(err);
        return reply({ "statusCode": 404, 'message': 'No cruise record found for that id'}).code(404);  
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
            event_id: Joi.any(),
            data_source: Joi.string(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string(),
              data_value: Joi.any(),
              data_uom: Joi.string()
            }))
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
      description: 'Return the event_aux_data record based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });


  server.route({
    method: 'GET',
    path: '/event_aux_data/bylowering/{id}',
    handler: function (request, reply) {

      db.collection(loweringsTable).findOne({ _id: ObjectID(request.params.id) }).then((lowering) => {

        if(lowering.lowering_hidden && !request.auth.credentials.scope.includes("admin")) {
          return reply({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden lowerings"}).code(401);
        }

        let query = {};
        let eventQuery = {};
        let startTS = new Date(lowering.start_ts);
        let stopTS = new Date(lowering.stop_ts);

        if(request.query.author) {
          if(Array.isArray(request.query.author)) {
            eventQuery.event_author  = { $in: request.query.author };
          } else {
            eventQuery.event_author  = request.query.author;
          }
        }

        if(request.query.value) {
          if(Array.isArray(request.query.value)) {

            let inList = [];
            let ninList = [];

            for( let value of request.query.value ) {
              if(value.startsWith("!")) {
                ninList.push(value.substr(1));
              } else {
                inList.push(value);
              }
            }
            
            if( inList.length > 0 && ninList.length > 0) {
              eventQuery.event_value  = { $in: inList, $nin: ninList };
            } else if (inList.length > 0) {
              eventQuery.event_value  = { $in: inList };
            } else {
              eventQuery.event_value  = { $nin: ninList };
            }

          } else {
            if(request.query.value.startsWith("!")) {
              eventQuery.event_value  = { $ne: request.query.value.substr(1) };
            } else {
              eventQuery.event_value  = request.query.value;
            }
          }
        }

        if(request.query.freetext) {

          eventQuery.event_free_text = { $regex: `${request.query.freetext}`};
        }

        //Time filtering
        if (request.query.startTS) {
          let tempStartTS = new Date(request.query.startTS);
          // console.log("tempStartTS:", tempStartTS);
          startTS = (tempStartTS >= startTS && tempStartTS <= stopTS)? tempStartTS : startTS;
          // console.log("startTS:", startTS);
        }

        if (request.query.stopTS) {
          let tempStopTS = new Date(request.query.stopTS);
          // console.log("tempStopTS:", tempStopTS);
          stopTS = (tempStopTS >= startTS && tempStopTS <= stopTS)? tempStopTS : stopTS;
          // console.log("stopTS:", stopTS);
        }

        eventQuery.ts = {"$gte": startTS , "$lte": stopTS };

        // let limit = (request.query.limit)? request.query.limit : 0;
        // let offset = (request.query.offset)? request.query.offset : 0;

        // console.log("eventQuery:", eventQuery);

        db.collection(eventsTable).find(eventQuery, { _id: 1 }).toArray().then((results) => {

          // EventID Filtering
          if(results.length > 0) {
            // console.log("results:", results);
            let eventIDs = results.map((event) => {
              // console.log(event._id);
              return event._id;
            });
            query.event_id  = { $in: eventIDs };

            // Datasource Filtering
            if(request.query.datasource) {
              if(Array.isArray(request.query.datasource)) {
                query.data_source  = { $in: request.query.datasource };
              } else {
                query.data_source  = request.query.datasource;
              }
            }

            // Limiting & Offset
            let limit = (request.query.limit)? request.query.limit : 0;
            let offset = (request.query.offset)? request.query.offset : 0;

            // console.log("query:", query);

            db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray().then((results) => {

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
          } else {
            return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
          }
        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });
      }).catch((err) => {
        console.log(err);
        return reply({ "statusCode": 404, 'message': 'No lowering record found for that id'}).code(404);  
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
            event_id: Joi.any(),
            data_source: Joi.string(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string(),
              data_value: Joi.any(),
              data_uom: Joi.string()
            }))
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
      description: 'Return the event_aux_data record based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_aux_data',
    handler: function (request, reply) {

      let query = {};

      if(request.query.author || request.query.value || request.query.freetext || request.query.startTS || request.query.stopTS) {

        if(request.query.eventID) {
          return reply({ "statusCode": 400, "error": 'malformed query', "message": 'Cannot include param eventID when using author, value, freetext, startTS or stopTS'}).code(400);          
        }

        let eventQuery = {};

        if(request.query.author) {
          if(Array.isArray(request.query.author)) {
            eventQuery.event_author  = { $in: request.query.author };
          } else {
            eventQuery.event_author  = request.query.author;
          }
        }

        if(request.query.value) {
          if(Array.isArray(request.query.value)) {

            let inList = [];
            let ninList = [];

            for( let value of request.query.value ) {
              if(value.startsWith("!")) {
                ninList.push(value.substr(1));
              } else {
                inList.push(value);
              }
            }
            
            if( inList.length > 0 && ninList.length > 0) {
              query.event_value  = { $in: inList, $nin: ninList };
            } else if (inList.length > 0) {
              query.event_value  = { $in: inList };
            } else {
              query.event_value  = { $nin: ninList };
            }

          } else {
            if(request.query.value.startsWith("!")) {
              query.event_value  = { $ne: request.query.value.substr(1) };
            } else {
              query.event_value  = request.query.value;
            }
          }
        }

        if(request.query.freetext) {

          eventQuery.event_free_text = { $regex: `${request.query.freetext}`};
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

          eventQuery.ts = {"$gte": startTS , "$lt": stopTS };
        }

        let limit = (request.query.limit)? request.query.limit : 0;
        let offset = (request.query.offset)? request.query.offset : 0;

        // console.log("eventQuery:", eventQuery);

        db.collection(eventsTable).find(eventQuery, { _id: 1 }).skip(offset).limit(limit).toArray().then((results) => {

          // EventID Filtering
          if(results.length > 0) {
            // console.log("results:", results);
            let eventIDs = results.map((event) => {
              // console.log(event._id);
              return new ObjectID(event._id);
            });
            query.event_id  = { $in: eventIDs };

            // Datasource Filtering
            if(request.query.datasource) {
              if(Array.isArray(request.query.datasource)) {
                query.data_source  = { $in: request.query.datasource };
              } else {
                query.data_source  = request.query.datasource;
              }
            }

            // Limiting & Offset
            let limit = (request.query.limit)? request.query.limit : 0;
            let offset = (request.query.offset)? request.query.offset : 0;

            // console.log("query:", query);

            db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray().then((results) => {

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
          } else {
            return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
          }
        }).catch((err) => {
          console.log("ERROR:", err);
          return reply().code(503);
        });
      } else {

        // EventID Filtering
        if(request.query.eventID) {
          if(Array.isArray(request.query.eventID)) {
            let eventIDs = request.query.eventID.map((id) => {
              return new ObjectID(id);
            });
            query.event_id  = { $in: eventIDs };
          } else {
            query.event_id  = new ObjectID(request.query.eventID);
          }
        }

        // Datasource Filtering
        if(request.query.datasource) {
          if(Array.isArray(request.query.datasource)) {
            query.data_source  = { $in: request.query.datasource };
          } else {
            query.data_source  = request.query.datasource;
          }
        }

        // Limiting & Offset
        let limit = (request.query.limit)? request.query.limit : 0;
        let offset = (request.query.offset)? request.query.offset : 0;

        // console.log("query:", query);

        db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray().then((results) => {

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
        scope: ['admin', 'event_manager', 'event_logger']
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
          eventID: Joi.alternatives().try(
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
            event_id: Joi.any(),
            data_source: Joi.string(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string(),
              data_value: Joi.any(),
              data_uom: Joi.string()
            }))
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
      description: 'Return the event_aux_data record based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventAuxDataTable).findOne(query).then((result) => {
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
            event_id: Joi.any(),
            data_source: Joi.string(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string(),
              data_value: Joi.string(),
              data_uom: Joi.string()
            }))
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
      description: 'Return the event_aux_data record based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth', 'api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/event_aux_data',
    handler: function (request, reply) {

      let event_aux_data = request.payload;

      // If payload includes a valid _id, try to insert/update
      if(request.payload.id) {
        try {
          event_aux_data._id = new ObjectID(request.payload.id);
          delete event_aux_data.id;
          event_aux_data.event_id = new ObjectID(request.payload.event_id);
          db.collection(eventAuxDataTable).insertOne(event_aux_data).then((result) => {
            return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
          }).catch((err) => {
            if(err.code === 11000) {
              // console.log(event_aux_data)
              db.collection(eventAuxDataTable).updateOne( { _id: event_aux_data._id }, { $set: event_aux_data} ).then((result) => {
                return reply(result).code(204);
              }).catch((err) => {
                console.log("ERROR Update 0:", err);
                return reply().code(503);
              });
            } else {
              console.log("ERROR Update Other 0:", err);
              return reply().code(503);
            }
          });
        } catch(err) {
          console.log("invalid ObjectID");
          return reply({statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters"}).code(400);
        }
      } else {

        try {
          event_aux_data.event_id = new ObjectID(request.payload.event_id);
        } catch(err) {
          console.log("invalid event ObjectID");
          return reply({statusCode: 400, error: "Invalid argument", message: "event_id must be a single String of 12 bytes or a string of 24 hex characters"}).code(400);
        }

        let query = {_id: event_aux_data.event_id};

        db.collection(eventsTable).findOne(query).then((queryResult) => {

          if(!queryResult){
            return reply({statusCode:'401', error: 'invalid event_id', message: 'event not found'}).code(401);
          }

          // console.log("queryResult:", queryResult)
          query = { event_id: event_aux_data.event_id, data_source: event_aux_data.data_source};
          // console.log("query1:", query)

          db.collection(eventAuxDataTable).findOne(query).then((result) => {

            // console.log("result1:", result)
          
            if(!result){
              // console.log("This is an insert")
              // event_aux_data.event_id = new ObjectID(event_aux_data.event_id);
              db.collection(eventAuxDataTable).insertOne(event_aux_data).then((result) => {
            
                return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);

              }).catch((err) => {
                if(err.code === 11000) {
                  // console.log(event_aux_data)
                  db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data} ).then((result) => {
                    return reply(result).code(204);
                  }).catch((err) => {
                    console.log("ERROR Update 1:", err);
                    return reply().code(503);
                  });
                } else {
                  console.log("ERROR Update Other 1:", err);
                  return reply().code(503);
                }
              });
            } else {

              // console.log("This is an update")
              query = { _id: new ObjectID(result._id) };
              // console.log("query:", query)

              db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data} ).then((result) => {
                return reply(result).code(204);
              }).catch((err) => {
                console.log("ERROR Update 2:", err);
                return reply().code(503);
              });
            }    
          }).catch((err) => {
            console.log("ERROR find aux data:", err);
            return reply().code(503);
          });
        }).catch((err) => {
          console.log("ERROR find event:", err);
          return reply().code(503);
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
          event_id: Joi.string().length(24).required(),
          data_source: Joi.string().min(1).max(100).required(),
          data_array: Joi.array().items(Joi.object({
            data_name: Joi.string().required(),
            data_value: Joi.alternatives().try(
              Joi.string(),
              Joi.number()
            ).required(),
            data_uom:Joi.string().optional()
          })).required().min(1),
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
      description: 'Create a new event_aux_data record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventAuxDataTable).findOne(query).then((result) => {

        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        let event_aux_data = request.payload;
        if(event_aux_data.data_array) {
          result.data_array.forEach((resultOption) => {
            let foundit = false;
            
            event_aux_data.data_array.forEach((requestOption) => {
            
              if(requestOption.data_name == resultOption.data_name) {
                requestOption.data_value = resultOption.data_value;
                
                if(resultOption.data_uom) {
                  requestOption.data_uom = resultOption.data_uom;
                }

                foundit = true;
              }
            });

            if (!foundit) {
              event_aux_data.data_array.push(resultOption);
            }
          });
        }


        db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data} ).then((result) => {
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
        scope: ['admin', 'event_manager', 'event_logger', 'api']
      },
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        params: Joi.object({
          id: Joi.string().length(24).required()
        }),
        payload: Joi.object({
          event_id: Joi.string().length(24).optional(),
          data_source: Joi.string().min(1).max(100).optional(),
          data_array: Joi.array().items(Joi.object({
            data_name:Joi.string().required(),
            data_value:Joi.string().required(),
            data_uom:Joi.string().optional(),
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
      description: 'Update a event_aux_data record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id)};

      db.collection(eventAuxDataTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.collection(eventAuxDataTable).deleteOne(query).then((result) => {
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
          }),
          404: Joi.object({
            statusCode: Joi.number().integer(),
            message: Joi.string()
          })

        }
      },
      description: 'Delete an event_aux_data record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'event_aux_data','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_aux_data',
  dependencies: ['hapi-mongodb']
};