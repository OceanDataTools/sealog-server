const Joi = require('@hapi/joi');

const {
  customVarsTable
} = require('../../../config/db_constants');

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  return doc;
};

exports.plugin = {
  name: 'routes-api-custom_vars',
  dependencies: ['hapi-mongodb', 'nes'],
  register: (server, options) => {

    server.subscription('/ws/status/updateCustomVars');

    server.route({
      method: 'GET',
      path: '/custom_vars',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        const query = {};

        if (request.query.name) {
          if (Array.isArray(request.query.name)) {
            query.custom_var_name  = { $in: request.query.name };
          }
          else {
            query.custom_var_name  = request.query.name;
          }
        }

        // console.log("query:", query)

        try {
          const results = await db.collection(customVarsTable).find(query).toArray();

          // console.log("results:", results)
          if (results.length > 0) {

            results.forEach(_renameAndClearFields);

            return h.response(results).code(200);
          }
 
          return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);
          
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }),
          query: Joi.object({
            name: Joi.string()
          }).optional(),
          options: {
            allowUnknown: true
          }
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              custom_var_name: Joi.string(),
              custom_var_value: Joi.string().allow('')
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
        description: 'Return the custom vars based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['custom_vars','auth', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/custom_vars/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        try {
          const result = await db.collection(customVarsTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          const mod_result = _renameAndClearFields(result);
          return h.response(mod_result).code(200);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth:{
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }),
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
              custom_var_name: Joi.string(),
              custom_var_value: Joi.string().allow('')
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
        description: 'Return the custom_var based on custom_var id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['custom_vars','auth','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/custom_vars/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};
        let custom_var_name = '';

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        try {
          const result = await db.collection(customVarsTable).findOne(query);

          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          custom_var_name = result.custom_var_name;
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }

        try {
          const updateResult = await db.collection(customVarsTable).updateOne(query, { $set: request.payload });

          const custom_var = { id: request.params.id, custom_var_name, custom_var_value : request.payload.custom_var_value };

          server.publish('/ws/status/updateCustomVars', custom_var );

          return h.response(updateResult).code(204);

        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }   
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }),
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          payload: Joi.object({
            custom_var_name: Joi.string().optional(),
            custom_var_value: Joi.string().allow('').optional()
          }).required().min(1),
          options: {
            allowUnknown: true
          }
        },
        response: {
          status: {
            404: Joi.object({
              statusCode: Joi.number().integer(),
              message: Joi.string()
            }),
            503: Joi.object({
              statusCode: Joi.number().integer(),
              error: Joi.string(),
              message: Joi.string()
            })
          }
        },
        description: 'Update a custom var record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['custom_vars','auth','api']
      }
    });
  }
};
