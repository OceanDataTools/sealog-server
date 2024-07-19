const Boom = require('@hapi/boom');

const {
  eventTemplatesTable
} = require('../../../config/db_constants');

const {
  authorizationHeader,
  databaseInsertResponse,
  eventTemplateParam,
  eventTemplateQuery,
  eventTemplateSuccessResponse,
  eventTemplateCreatePayload,
  eventTemplateUpdatePayload
} = require('../../../lib/validations');

const _renameAndClearFields = (doc, admin = false) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;
  if (!admin) {
    delete doc.disabled;
  }

  return doc;
};

exports.plugin = {
  name: 'routes-api-event_templates',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.subscription('/ws/status/newEventTemplates');
    server.subscription('/ws/status/updateEventTemplates');
    server.subscription('/ws/status/deleteEventTemplates');

    server.route({
      method: 'GET',
      path: '/event_templates',
      async handler(request, h) {

        const db = request.mongo.db;

        if (request.query.system_template) {
          query.system_template = request.query.system_template;
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;
        const sort = (request.query.sort) ? { [request.query.sort]: 1 } : {};

        const query = (request.auth.credentials.scope.includes('admin')) ? {} : { disabled: { $eq: false }, admin_only: { $eq: false } };

        if (typeof request.query.system_template !== 'undefined') {
          query.system_template = request.query.system_template;
        }

        try {
          const results = await db.collection(eventTemplatesTable).find(query).sort(sort).skip(offset).limit(limit).toArray();

          if (results.length > 0) {
            results.forEach((result) => {

              return _renameAndClearFields(result, request.auth.credentials.scope.includes('admin'));
            });

            return h.response(results).code(200);
          }

          return Boom.notFound('No records found');

        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          query: eventTemplateQuery
        },
        response: {
          status: {
            200: eventTemplateSuccessResponse
          }
        },
        description: 'Return the event templates based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','api']
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

          if (!request.auth.credentials.scope.includes('admin') && result.admin_only) {
            return Boom.notFound('template only available to admin users');
          }

          return h.response(_renameAndClearFields(result, request.auth.credentials.scope.includes('admin'))).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
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
        tags: ['event_templates','api']
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
            console.log('invalid ObjectID');
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }

        if (!event_template.event_options) {
          event_template.event_options = [];
        }

        if (typeof event_template.event_free_text_required === 'undefined') {
          event_template.event_free_text_required = false;
        }

        if (!event_template.template_categories) {
          event_template.template_categories = [];
        }

        if (typeof event_template.disabled === 'undefined') {
          event_template.disabled = false;
        }

        if (typeof event_template.admin_only === 'undefined') {
          event_template.admin_only = false;
        }

        try {
          const result = await db.collection(eventTemplatesTable).insertOne(event_template);

          event_template._id = result.insertedId;
          _renameAndClearFields(event_template);
          server.publish('/ws/status/newEventTemplates', event_template);

          return h.response(result).code(201);

        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          payload: eventTemplateCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: databaseInsertResponse
          }
        },

        description: 'Create a new event template',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','api']
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

        let event_template = {};
        try {
          const result = await db.collection(eventTemplatesTable).findOne(query);

          if (!result) {
            return Boom.badRequest('No record found for id: ' + request.params.id );
          }

          event_template = { ...result, ...request.payload };
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (!event_template.system_template) {
          event_template.admin_only = false;
        }

        try {
          const result = await db.collection(eventTemplatesTable).findOneAndUpdate(query, { $set: event_template },{ returnDocument: 'after' });
          server.publish('/ws/status/updateEventTemplates', _renameAndClearFields(result.value));

          return h.response().code(204);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
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
          payload: eventTemplateUpdatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },
        description: 'Update an event template record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_templates','api']
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
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        try {
          const result = await db.collection(eventTemplatesTable).findOneAndDelete(query);
          server.publish('/ws/status/deleteEventTemplates', _renameAndClearFields(result.value));

          return h.response().code(204);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
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
        tags: ['event_templates','api']
      }
    });
  }
};

