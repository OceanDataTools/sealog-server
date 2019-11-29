const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');

const {
  eventTemplatesTable
} = require('../../../config/db_constants');

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  return doc;
};

const authorizationHeader = Joi.object({
  authorization: Joi.string().required()
}).options({ allowUnknown: true }).label('authorizationHeader');

const eventTemplateParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('eventTemplateParam');

const eventTemplateSuccessResponse = Joi.object({
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
    event_option_required: Joi.boolean()
  }))
}).label('eventTemplateSuccessResponse');

const eventTemplatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  event_name: Joi.string().required(),
  event_value: Joi.string().required(),
  event_free_text_required: Joi.boolean().required(),
  system_template: Joi.boolean().required(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string().required(),
    event_option_type: Joi.string().required(),
    event_option_default_value: Joi.string().allow('').optional(),
    event_option_values: Joi.array().items(Joi.string()).required(),
    event_option_allow_freeform: Joi.boolean().required(),
    event_option_required: Joi.boolean().required()
  })).optional()
}).label('eventTemplatePayload');

exports.plugin = {
  name: 'routes-api-event_templates',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    server.route({
      method: 'GET',
      path: '/event_templates',
      async handler(request, h) {

        const db = request.mongo.db;

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        try {
          const results = await db.collection(eventTemplatesTable).find().skip(offset).limit(limit).toArray();

          if (results.length > 0) {
            results.forEach(_renameAndClearFields);
            return h.response(results).code(200);
          }
 
          return Boom.notFound('No records found');
          
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          query: Joi.object({
            offset: Joi.number().integer().min(0).optional(),
            limit: Joi.number().integer().min(1).optional()
          }).optional()
        },
        response: {
          status: {
            200: Joi.array().items(eventTemplateSuccessResponse),
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
        tags: ['event_templates','auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_templates/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(eventTemplatesTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          return h.response(_renameAndClearFields(result)).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth:{
          strategy: 'jwt',
          scope: ['admin', 'read_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          params: eventTemplateParam
        },
        response: {
          status: {
            200: eventTemplateSuccessResponse
          }
        },
        description: 'Return the event template based on the event template id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','auth','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/event_templates',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const event_template = request.payload;

        if (request.payload.id) {
          try {
            event_template._id = new ObjectID(request.payload.id);
            delete event_template.id;
          }
          catch (err) {
            console.log("invalid ObjectID");
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }

        if (!event_template.event_options) {
          event_template.event_options = [];
        }

        if (!event_template.event_free_text_required) {
          event_template.event_free_text_required = false;
        }

        try {
          const result = await db.collection(eventTemplatesTable).insertOne(event_template);

          return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);

        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          payload: eventTemplatePayload
        },
        response: {
          status: {
            201: Joi.object({
              n: Joi.number().integer(),
              ok: Joi.number().integer(),
              insertedCount: Joi.number().integer(),
              insertedId: Joi.object()
            })
          }
        },

        description: 'Create a new event template',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','auth','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/event_templates/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(eventTemplatesTable).findOne(query);

          if (!result) {
            return Boom.badRequest('No record found for id: ' + request.params.id );
          }
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }

        const event_template = request.payload;

        try {
          await db.collection(eventTemplatesTable).updateOne(query, { $set: event_template });
          return h.response().code(204);
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          params: eventTemplateParam,
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
              event_option_required: Joi.boolean().required()
            })).optional()
          }).required().min(1)
        },
        response: {
          status: {}
        },
        description: 'Update an event template record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','auth','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/event_templates/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(eventTemplatesTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id );
          }

          if (result.system_template && !request.auth.credentials.scope.includes('admin')) {
            return Boom.unauthorized('user does not have permission to delete system templates');
          }

          try {
            await db.collection(eventTemplatesTable).deleteOne(query);
            return h.response(result).code(204);
          }
          catch (err) {
            console.log(err);
            return Boom.serviceUnavailable('database error');
          }
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          params: eventTemplateParam
        },
        response: {
          status: {}
        },
        description: 'Delete an event templates record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','auth','api']
      }
    });
  }
};

