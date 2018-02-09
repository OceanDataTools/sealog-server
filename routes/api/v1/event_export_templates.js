'use strict';

const Joi = require('joi');

const {
  eventExportTemplatesTable,
  eventsTable,
  eventAuxDataTable
} = require('../../../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const _renameAndClearFields = (doc) => {

    //rename id
    doc.id = doc._id;
    delete doc._id;
    delete doc.event_id;

    if(doc.aux_data && doc.aux_data.length > 0) {
      doc.aux_data.forEach(_renameAndClearFields);
    }

    return doc;
  };

  server.route({
    method: 'GET',
    path: '/event_export_templates',
    handler: function (request, reply) {

      let query = {};

      let limit = (request.query.limit)? request.query.limit : 0;
      let offset = (request.query.offset)? request.query.offset : 0;

      // console.log("query:", query);

      db.collection(eventExportTemplatesTable).find(query).skip(offset).limit(limit).toArray().then((results) => {
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
            event_export_template_name: Joi.string(),
            event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
            event_export_template_offset: Joi.number().integer().min(0),
            event_export_template_limit: Joi.number().integer().min(0),
            event_export_template_startTS: Joi.date().iso().allow(''),
            event_export_template_stopTS: Joi.date().iso().allow(''),
            event_export_template_author_filter: Joi.array().items(Joi.string()),
            event_export_template_datasource_filter: Joi.array().items(Joi.string()),
            event_export_template_freetext_filter: Joi.string().allow(''),
            event_export_template_include_aux_data: Joi.bool()
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
      description: 'Return the event export templates based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      let query = { _id: ObjectID(request.params.id) };

      // console.log(query);

      db.collection(eventExportTemplatesTable).findOne(query).then((result) => {
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
          id: Joi.string().required()
        }),
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          200: Joi.object({
            id: Joi.object(),
            event_export_template_name: Joi.string(),
            event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
            event_export_template_offset: Joi.number().integer().min(0),
            event_export_template_limit: Joi.number().integer().min(0),
            event_export_template_startTS: Joi.date().iso().allow(''),
            event_export_template_stopTS: Joi.date().iso().allow(''),
            event_export_template_author_filter: Joi.array().items(Joi.string()),
            event_export_template_datasource_filter: Joi.array().items(Joi.string()),
            event_export_template_freetext_filter: Joi.string().allow(''),
            event_export_template_include_aux_data: Joi.bool()
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
      description: 'Return the event export templates based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_export_templates/{id}/run',
    handler: function (request, reply) {

      let templateQuery = { _id: ObjectID(request.params.id) };

      // console.log(query);

      db.collection(eventExportTemplatesTable).findOne(templateQuery).then((templateResult) => {
        if (!templateResult) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        let query = {};

        // console.log(templateResult);
        //Data source filtering
        if (templateResult.event_export_template_datasource_filter.length > 0) {

          let datasource_query = {};
          datasource_query.data_source  = { $in: templateResult.event_export_template_datasource_filter };
          
          db.collection(eventAuxDataTable).find(datasource_query, {_id: 0, event_id: 1}).toArray().then((collection) => {

            let eventIDs = collection.map(x => x.event_id);

            // console.log("collection:", eventIDs);

            query._id = { $in: eventIDs};

            if(templateResult.event_export_template_author_filter.length > 0) {
              // console.log("event_author filtering");
              query.event_author  = { $in: templateResult.event_export_template_author_filter };
            }

            if(templateResult.event_export_template_eventvalue_filter.length > 0) {
              query.event_value  = { $in: templateResult.event_export_template_eventvalue_filter };
            }

            if(templateResult.event_export_template_freetext_filter) {

              query.event_free_text = { $regex: `${templateResult.event_export_template_freetext_filter}`};
            }

            //Time filtering
            if ((templateResult.event_export_template_startTS) || (templateResult.event_export_template_stopTS)) {
              // console.log("ts filtering");

              let startTS = new Date("1970-01-01T00:00:00.000Z");
              let stopTS = new Date();

              if (templateResult.event_export_template_startTS) {
                startTS = new Date(templateResult.event_export_template_startTS);
              }

              if (templateResult.event_export_template_stopTS) {
                stopTS = new Date(templateResult.event_export_template_stopTS);
              }

              query.ts = {"$gte": startTS , "$lt": stopTS };
            }

            let offset = (templateResult.event_export_template_offset)? templateResult.event_export_template_offset : 0;

            let lookup = {
              from: eventAuxDataTable,
              localField: "_id",
              foreignField: "event_id",
              as: "aux_data"
            };

            let aggregate = [];
            aggregate.push({ $lookup: lookup });
            aggregate.push({ $match: query});
            if(request.query.limit) { 
              aggregate.push({ $limit: request.query.limit});
            }

            // console.log("aggregate:", aggregate);

            db.collection(eventsTable).aggregate(aggregate).skip(offset).toArray().then((results) => {

              if (results.length > 0) {
                results.forEach(_renameAndClearFields);
                return reply(results).code(200);
              } else {
                return reply([]).code(200);
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

          if(templateResult.event_export_template_author_filter.length > 0) {
            // console.log("event_author filtering");
            query.event_author  = { $in: templateResult.event_export_template_author_filter };
          }

          if(templateResult.event_export_template_eventvalue_filter.length > 0) {
            // console.log("event_value filtering");
            query.event_value  = { $in: templateResult.event_export_template_eventvalue_filter };
          }

          if(templateResult.event_export_template_freetext_filter) {
            // console.log("event_free_text filtering");
            query.event_free_text = { $regex: `${templateResult.event_export_template_freetext_filter}`};
          }

          //Time filtering
          if ((templateResult.event_export_template_startTS) || (templateResult.event_export_template_stopTS)) {
            // console.log("ts filtering");

            let startTS = new Date("1970-01-01T00:00:00.000Z");
            let stopTS = new Date();

            if (templateResult.event_export_template_startTS) {
              startTS = new Date(templateResult.event_export_template_startTS);
            }

            if (templateResult.event_export_template_stopTS) {
              stopTS = new Date(templateResult.event_export_template_stopTS);
            }

            query.ts = {"$gte": startTS , "$lt": stopTS };
          }

          let offset = (templateResult.event_export_template_offset)? templateResult.event_export_template_offset : 0;

          let lookup = {
            from: eventAuxDataTable,
            localField: "_id",
            foreignField: "event_id",
            as: "aux_data"
          };

          let aggregate = [];
          aggregate.push({ $lookup: lookup });
          aggregate.push({ $match: query});
          if(request.query.limit) { 
            aggregate.push({ $limit: request.query.limit});
          }

          console.log("aggregate:", aggregate);

          db.collection(eventsTable).aggregate(aggregate).skip(offset).toArray().then((results) => {

            if (results.length > 0) {
              results.forEach(_renameAndClearFields);
              return reply(results).code(200);
            } else {
              return reply([]).code(200);
            }
          }).catch((err) => {
            console.log("ERROR:", err);
            return reply().code(503);
          });
        }
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
          id: Joi.string().required()
        }),
        options: {
          allowUnknown: true
        }
      },
      response: {
        status: {
          //200: Joi.object({
          //  id: Joi.string().uuid(),
          //  event_export_template_name: Joi.string(),
          //  event_export_definitions: Joi.array().items(Joi.string()),
          //}),
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
      description: 'Run the event export templates based on event export template id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });


  server.route({
    method: 'POST',
    path: '/event_export_templates',
    handler: function (request, reply) {

      let event_template = request.payload;

      db.collection(eventExportTemplatesTable).insertOne(event_template, (err, result) => {

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
        payload: Joi.object({
          id: Joi.string(),
          event_export_template_name: Joi.string(),
          event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
          event_export_template_offset: Joi.number().integer().min(0),
          event_export_template_limit: Joi.number().integer().min(0),
          event_export_template_startTS: Joi.date().iso().allow(''),
          event_export_template_stopTS: Joi.date().iso().allow(''),
          event_export_template_author_filter: Joi.array().items(Joi.string()),
          event_export_template_datasource_filter: Joi.array().items(Joi.string()),
          event_export_template_freetext_filter: Joi.string().allow(''),
          event_export_template_include_aux_data: Joi.bool()
        }),
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

      description: 'Create a new event export template',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };

      db.collection(eventExportTemplatesTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        let event_export_template = request.payload;

        db.collection(eventExportTemplatesTable).updateOne( query, { $set: event_export_template} ).then(() => {
          return reply().code(204);
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
          id: Joi.string().required()
        }),
        payload: Joi.object({
          id: Joi.string(),
          event_export_template_name: Joi.string(),
          event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
          event_export_template_offset: Joi.number().integer().min(0),
          event_export_template_limit: Joi.number().integer().min(0),
          event_export_template_startTS: Joi.date().iso().allow(''),
          event_export_template_stopTS: Joi.date().iso().allow(''),
          event_export_template_author_filter: Joi.array().items(Joi.string()),
          event_export_template_datasource_filter: Joi.array().items(Joi.string()),
          event_export_template_freetext_filter: Joi.string().allow(''),
          event_export_template_include_aux_data: Joi.bool()
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
      description: 'Update a event export template record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      let query = { _id: new ObjectID(request.params.id) };
      // console.log(query);

      db.collection(eventExportTemplatesTable).findOne(query).then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.collection(eventExportTemplatesTable).deleteOne(query).then((result) => {
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
          id: Joi.string().required()
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
      description: 'Delete an event export template record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'event_templates','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_export_templates',
  dependencies: ['hapi-mongodb']
};
