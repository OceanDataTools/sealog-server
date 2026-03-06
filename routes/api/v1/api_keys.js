// const Joi = require('joi');
const Boom = require('@hapi/boom');
const { hashedApiKey, randomAsciiString } = require('../../../lib/utils');

const {
  apiKeysTable
} = require('../../../config/db_constants');

const {
  apiKeyCreatePayload,
  apiKeyParam,
  apiKeyQuery,
  apiKeyUpdatePayload,
  apiKeySuccessResponse,
  authorizationHeader,
  databaseInsertResponse
} = require('../../../lib/validations');

exports.plugin = {
  name: 'apiKeys',
  dependencies: ['hapi-auth-jwt2', 'hapi-mongodb'],
  register: (server) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const _renameAndClearFields = (doc) => {

      //rename id
      doc.id = doc._id;
      delete doc._id;

      //remove fields entirely
      delete doc.key_hash;

      return doc;
    };

    // ---------------- LIST API KEYS ----------------
    server.route({
      method: 'GET',
      path: '/api-keys',
      handler: async (request, h) => {

        // if the request includes a user_id that is not the current user's ID and the user id
        if (request.params.user_id) {
          if (!request.auth.credentials.roles.includes('admin') || request.auth.credentials.id !== request.params.user_id) {
            return Boom.badRequest('The requesting user is unauthorized to make that request');
          }
        }

        const userId = request.params.user_id || request.auth.credentials.id;
        const result = await db.collection(apiKeysTable)
          .find({ user_id: ObjectID(userId) })
          .toArray();

        console.error(result);

        result.forEach(_renameAndClearFields);

        return h.response(result).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_apikeys']
        },
        validate: {
          headers: authorizationHeader,
          query: apiKeyQuery
        },
        response: {
          status: {
            200: apiKeySuccessResponse
          }
        },
        description: 'Return the API Keys based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['api_keys','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/api-keys/{id}',
      handler: async (request, h) => {

        const { id } = request.params;

        const result = await db.collection(apiKeysTable).findOne({ _id: new ObjectID(id) });

        if (!result) {
          throw Boom.notFound('API Key not found');
        }

        if (!request.auth.credentials.roles.includes('admin') && request.auth.credentials.id !== result.user_id) {
          return Boom.badRequest('The requesting user is unauthorized to make that request');
        }

        const cleanedResult = _renameAndClearFields(result);

        return h.response(cleanedResult).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_apikeys']
        },
        validate: {
          headers: authorizationHeader,
          params: apiKeyQuery
        },
        response: {
          status: {
            200: apiKeySuccessResponse
          }
        },
        description: 'Return the API Keys based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['api_keys','api']
      }
    });

    // ---------------- CREATE API KEY ----------------
    server.route({
      method: 'POST',
      path: '/api-keys',
      handler: async (request, h) => {

        const { label, roles = [], expires } = request.payload;
        const apiKeyPlain = randomAsciiString(20);
        const keyHash = hashedApiKey(apiKeyPlain);

        const result = await db.collection(apiKeysTable).insertOne({
          user_id: ObjectID(request.auth.credentials.id),
          key_hash: keyHash,
          label,
          roles,
          created: new Date(),
          last_used: null,
          disabled: false,
          expires: expires ? new Date(expires) : null
        });

        return h.response({
          id: result.insertedId,
          key: apiKeyPlain // show plain key ONCE
        }).code(201);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_api_keys']
        },
        validate: {
          headers: authorizationHeader,
          payload: apiKeyCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },

        description: 'Create a new API key',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['api_keys','api']
      }
    });


    // ---------------- PATCH / UPDATE LABEL OR EXPIRATION ----------------
    server.route({
      method: 'PATCH',
      path: '/api-keys/{id}',
      handler: async (request, h) => {

        const { id } = request.params;

        const result = await db.collection(apiKeysTable).findOne({ _id: new ObjectID(id) });

        if (!result) {
          throw Boom.notFound('API Key not found');
        }

        if (!request.auth.credentials.roles.includes('admin') && request.auth.credentials.id !== result.user_id) {
          return Boom.badRequest('The requesting user is unauthorized to make that request');
        }

        const updates = request.payload;

        const updateDoc = {};
        if (updates.label !== undefined) {
          updateDoc.label = updates.label;
        }

        if (updates.expires !== undefined) {
          updateDoc.expires = updates.expires ? new Date(updates.expires) : null;
        }

        if (updates.disabled !== undefined) {
          updateDoc.disabled = updates.disabled;
        }

        await db.collection(apiKeysTable).updateOne(
          { _id: new ObjectID(id) },
          { $set: updateDoc }
        );

        return h.response({ message: 'API Key updated' }).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_api_keys']
        },
        validate: {
          headers: authorizationHeader,
          params: apiKeyParam,
          payload: apiKeyUpdatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: { }
        },
        description: 'Update an API key',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['api_keys','api']
      }
    });


    // ---------------- DELETE / REVOKE API KEY ----------------
    server.route({
      method: 'DELETE',
      path: '/api-keys/{id}',
      handler: async (request, h) => {

        const { id } = request.params;

        const result = await db.collection(apiKeysTable).findOne({ _id: new ObjectID(id) });

        if (!result) {
          throw Boom.notFound('API Key not found');
        }

        if (!request.auth.credentials.roles.includes('admin') && request.auth.credentials.id !== result.user_id) {
          return Boom.badRequest('The requesting user is unauthorized to make that request');
        }

        await db.collection(apiKeysTable).updateOne(
          { _id: new ObjectID(id) },
          { $set: { disabled: true } } // soft delete
        );

        return h.response({ message: 'API Key disabled' }).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_api_keys']
        },
        validate: {
          headers: authorizationHeader,
          params: apiKeyParam
        },
        response: {
          status: {}
        },
        description: 'Delete an API key',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['api_keys','api']
      }
    });
  }
};

