const Boom = require('@hapi/boom');

const {
  authorizationHeader,
  sequenceCounterPayload,
  sequenceCountersResponse,
  sequenceCreatePayload,
  sequenceImportPayload,
  sequenceImportResponse,
  sequenceNextQuery,
  sequenceNextResponse,
  sequenceParam,
  sequenceResponse,
  sequencesResponse,
  sequenceUpdatePayload
} = require('../../../lib/validations');

const { ensureCollectionIndexes } = require('../../../lib/db_indexes');

const {
  findSequence,
  parseFormat,
  previewId,
  sequenceCountersTable,
  sequencesTable,
  templatesUsingSequence
} = require('../../../lib/sequences');

// Names the routes below use as path segments
const RESERVED_NAMES = ['export', 'import'];

const sequenceError = (err) => {

  if (['BAD_FORMAT', 'NO_SCOPE'].includes(err.code)) {
    return Boom.badRequest(err.message);
  }

  console.log(err);
  return Boom.serverUnavailable('database error');
};

// A Boom error for a definition that can't be saved, or null
const checkDefinition = (definition) => {

  if (definition.name && RESERVED_NAMES.includes(definition.name)) {
    return Boom.badRequest(`${definition.name} is reserved; choose another name`);
  }

  if (definition.format !== undefined) {
    try {
      parseFormat(definition.format);
    }
    catch (err) {
      return Boom.badRequest(err.message);
    }
  }

  return null;
};

exports.plugin = {
  name: 'routes-api-sequences',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: async (server, options) => {

    // The counters' unique index keeps concurrent first uses of a scope from
    // creating two counters, so it's built before any request
    await ensureCollectionIndexes(server.mongo.db, sequencesTable);
    await ensureCollectionIndexes(server.mongo.db, sequenceCountersTable);

    server.subscription('/ws/status/updateSequences');

    server.route({
      method: 'GET',
      path: '/sequences',
      async handler(request) {

        try {
          return await request.mongo.db.collection(sequencesTable).find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
        }
        catch (err) {
          return sequenceError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader
        },
        response: {
          status: {
            200: sequencesResponse
          }
        },
        description: 'Return the ID sequences',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/sequences/export',
      async handler(request) {

        try {
          return await request.mongo.db.collection(sequencesTable).find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
        }
        catch (err) {
          return sequenceError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader
        },
        response: {
          status: {
            200: sequencesResponse
          }
        },
        description: 'Export the ID sequence definitions',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>Definitions only: counters stay on this server.</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/sequences/import',
      async handler(request) {

        const db = request.mongo.db;

        for (const definition of request.payload) {
          const error = checkDefinition(definition);
          if (error) {
            return error;
          }
        }

        const report = { created: [], updated: [] };
        try {
          for (const { name, ...fields } of request.payload) {
            const result = await db.collection(sequencesTable).updateOne({ name }, { $set: fields }, { upsert: true });
            (result.upsertedCount ? report.created : report.updated).push(name);
            server.publish('/ws/status/updateSequences', { name });
          }
        }
        catch (err) {
          return sequenceError(err);
        }

        return report;
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          payload: sequenceImportPayload
        },
        response: {
          status: {
            200: sequenceImportResponse
          }
        },
        description: 'Import ID sequence definitions',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>Creates each sequence, or replaces the definition of one with the same name. \
          Counters are left as they are.</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/sequences/{name}',
      async handler(request) {

        try {
          const sequence = await findSequence(request.mongo.db, request.params.name);
          return sequence || Boom.notFound(`No sequence named ${request.params.name}`);
        }
        catch (err) {
          return sequenceError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam
        },
        response: {
          status: {
            200: sequenceResponse
          }
        },
        description: 'Return an ID sequence',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/sequences',
      async handler(request, h) {

        const error = checkDefinition(request.payload);
        if (error) {
          return error;
        }

        try {
          await request.mongo.db.collection(sequencesTable).insertOne({ ...request.payload });
        }
        catch (err) {
          if (err.code === 11000) {
            return Boom.conflict(`A sequence named ${request.payload.name} already exists`);
          }

          return sequenceError(err);
        }

        server.publish('/ws/status/updateSequences', { name: request.payload.name });
        return h.response(request.payload).code(201);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          payload: sequenceCreatePayload
        },
        response: {
          status: {
            201: sequenceResponse
          }
        },
        description: 'Create an ID sequence',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p><strong>format</strong> combines fixed text with {cruise_id}, {lowering_id}, the event\'s \
          {yyyy}, {yy}, {mm}, {dd} and {doy} (UTC), and the counter {n} (exactly once; {n:03} pads it to 3 digits). \
          <strong>scope</strong> (global, cruise or lowering) says what the counter restarts for. \
          <strong>start</strong> is the first number (default 1).</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/sequences/{name}',
      async handler(request, h) {

        const db = request.mongo.db;
        const { name } = request.params;

        const error = checkDefinition(request.payload);
        if (error) {
          return error;
        }

        try {
          const sequence = await findSequence(db, name);
          if (!sequence) {
            return Boom.notFound(`No sequence named ${name}`);
          }

          // Counters are kept per scope key, so a used sequence keeps its scope
          if (request.payload.scope && request.payload.scope !== sequence.scope && await db.collection(sequenceCountersTable).countDocuments({ sequence: name })) {
            return Boom.conflict(`${name} has issued IDs, so its scope can't change; create a new sequence instead`);
          }

          await db.collection(sequencesTable).updateOne({ name }, { $set: request.payload });
        }
        catch (err) {
          return sequenceError(err);
        }

        server.publish('/ws/status/updateSequences', { name });
        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam,
          payload: sequenceUpdatePayload
        },
        response: {
          status: {}
        },
        description: 'Update an ID sequence',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>The format can change after IDs have been issued: they keep their values and the counters carry on. \
          The scope can\'t change once IDs have been issued (409).</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/sequences/{name}',
      async handler(request, h) {

        const db = request.mongo.db;
        const { name } = request.params;

        try {
          const templates = await templatesUsingSequence(db, name);
          if (templates.length) {
            const names = [...new Set(templates.map((template) => template.event_name))].join(', ');
            return Boom.conflict(`${name} is used by event templates: ${names}. Change their options first`);
          }

          const result = await db.collection(sequencesTable).deleteOne({ name });
          if (!result.deletedCount) {
            return Boom.notFound(`No sequence named ${name}`);
          }

          await db.collection(sequenceCountersTable).deleteMany({ sequence: name });
        }
        catch (err) {
          return sequenceError(err);
        }

        server.publish('/ws/status/updateSequences', { name, deleted: true });
        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam
        },
        response: {
          status: {}
        },
        description: 'Delete an ID sequence and its counters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>Refused (409) while event templates use it. IDs already on events are unchanged.</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/sequences/{name}/counters',
      async handler(request) {

        const db = request.mongo.db;
        const { name } = request.params;

        try {
          const sequence = await findSequence(db, name);
          if (!sequence) {
            return Boom.notFound(`No sequence named ${name}`);
          }

          const counters = await db.collection(sequenceCountersTable).find({ sequence: name }, { projection: { _id: 0, scope_key: 1, last: 1 } }).sort({ scope_key: 1 }).toArray();
          return counters.map(({ scope_key, last }) => ({ scope_key, last, next: last + 1 }));
        }
        catch (err) {
          return sequenceError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam
        },
        response: {
          status: {
            200: sequenceCountersResponse
          }
        },
        description: 'Return an ID sequence\'s counters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>One per scope key: the cruise_id or lowering_id (\'\' for a global sequence), with the last number issued.</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'PUT',
      path: '/sequences/{name}/counters',
      async handler(request, h) {

        const db = request.mongo.db;
        const { name } = request.params;
        const { scope_key, next } = request.payload;

        try {
          const sequence = await findSequence(db, name);
          if (!sequence) {
            return Boom.notFound(`No sequence named ${name}`);
          }

          if ((sequence.scope === 'global') !== (scope_key === '')) {
            return Boom.badRequest(sequence.scope === 'global' ? `${name} is global: its scope_key is ''` : `${name} is per ${sequence.scope}: give its ${sequence.scope}_id as scope_key`);
          }

          await db.collection(sequenceCountersTable).updateOne({ sequence: name, scope_key }, { $set: { last: next - 1 } }, { upsert: true });
        }
        catch (err) {
          return sequenceError(err);
        }

        server.publish('/ws/status/updateSequences', { name });
        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam,
          payload: sequenceCounterPayload
        },
        response: {
          status: {}
        },
        description: 'Set the next number of an ID sequence',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>Sets the number the next ID for <strong>scope_key</strong> gets, e.g. to carry on from another system. \
          It can be set lower than numbers already issued, which would issue them again.</p>',
        tags: ['sequences','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/sequences/{name}/next',
      async handler(request) {

        const db = request.mongo.db;
        const { name } = request.params;

        try {
          const sequence = await findSequence(db, name);
          if (!sequence) {
            return Boom.notFound(`No sequence named ${name}`);
          }

          return await previewId(db, sequence, request.query.ts || new Date());
        }
        catch (err) {
          return sequenceError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: sequenceParam,
          query: sequenceNextQuery
        },
        response: {
          status: {
            200: sequenceNextResponse
          }
        },
        description: 'Preview the next ID of a sequence',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>\
          <p>The ID the next event at <strong>ts</strong> (default now) would get, without taking it: another event \
          saved first gets it instead. <strong>prefix</strong> and <strong>suffix</strong> are the ID\'s text around \
          the number, to read the number of an ID typed by hand. 400 when the sequence needs a cruise or lowering \
          and none covers ts.</p>',
        tags: ['sequences','api']
      }
    });
  }
};
