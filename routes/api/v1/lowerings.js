const Boom = require('@hapi/boom');
const Fs = require('fs');
const Tmp = require('tmp');
const Path = require('path');
const { parseAsync } = require('json2csv');
const Deepcopy = require('deepcopy');

const {
  LOWERING_PATH
} = require('../../../config/path_constants');

const {
  useAccessControl
} = require('../../../config/email_constants');

const {
  cruisesTable,
  eventsTable,
  loweringsTable,
  usersTable
} = require('../../../config/db_constants');

const {
  rmDir,
  mvFilesToDir
} = require('../../../lib/utils');

const {
  authorizationHeader,databaseInsertResponse,loweringParam,cruiseParam,eventParam,loweringCreatePayload,loweringCreatePayloadNoAccessControl,loweringUpdatePayload,loweringUpdatePayloadNoAccessControl,loweringQuery,singleLoweringQuery,loweringSuccessResponse,loweringUpdatePermissionsPayload
} = require('../../../lib/validations');

const flattenLoweringObjs = (lowering_objs) => {

  const flat_lowerings = lowering_objs.map((lowering) => {

    const copied_lowering = Deepcopy(lowering);

    Object.keys(copied_lowering.lowering_additional_meta).forEach((key) => {

      copied_lowering[key] = copied_lowering.lowering_additional_meta[key];
      if (Array.isArray(copied_lowering[key])) {
        copied_lowering[key] = copied_lowering[key].join(',');
      }
    });

    delete copied_lowering.lowering_additional_meta;
    delete copied_lowering.lowering_hidden;
    delete copied_lowering.lowering_access_list;
    delete copied_lowering.lowering_files;

    copied_lowering.start_ts = copied_lowering.start_ts.toISOString();
    copied_lowering.stop_ts = copied_lowering.stop_ts.toISOString();
    copied_lowering.id = copied_lowering.id.id.toString('hex');
    copied_lowering.lowering_tags = copied_lowering.lowering_tags.join(',');

    return copied_lowering;
  });

  return flat_lowerings;
};

const buildLoweringCSVHeaders = (flat_lowerings) => {

  const csv_headers = flat_lowerings.reduce((headers, lowering) => {

    const key_names = Object.keys(lowering);

    return headers.concat(key_names).filter((value, index, self) => {

      return self.indexOf(value) === index;
    });
  }, ['id','lowering_id','start_ts','stop_ts','lowering_location','lowering_tags']);

  return csv_headers.slice(0, 6).concat(csv_headers.slice(6).sort());
};

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  if ( !useAccessControl ) {
    delete doc.lowering_access_list;
  }

  return doc;
};


exports.plugin = {
  name: 'routes-api-lowerings',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.subscription('/ws/status/newLowerings');
    server.subscription('/ws/status/updateLowerings');

    server.route({
      method: 'GET',
      path: '/lowerings',
      async handler(request, h) {

        const db = request.mongo.db;
        const query = {};

        //Hidden filtering
        if (typeof request.query.hidden !== 'undefined') {

          if (request.auth.credentials.scope.includes('admin')) {
            query.lowering_hidden = request.query.hidden;
          }
          else if (request.query.hidden) {
            return Boom.unauthorized('User not authorized to retrieve hidden lowerings');
          }
          else {
            query.lowering_hidden = false;
          }
        }
        else {
          if (!request.auth.credentials.scope.includes('admin')) {
            query.lowering_hidden = false;
          }
        }

        // use access control filtering
        if (useAccessControl && !request.auth.credentials.scope.includes('admin')) {
          query.$or = [{ lowering_hidden: query.lowering_hidden }, { lowering_access_list: request.auth.credentials.id }];
          // query.$or = [{ lowering_hidden: query.lowering_hidden }];
          delete query.lowering_hidden;
        }

        // Lowering ID filtering... if using this then there's no reason to use other filters
        if (request.query.lowering_id) {
          query.lowering_id = request.query.lowering_id;
        }
        else {

          // Location filtering
          if (request.query.lowering_location) {
            query.lowering_location = request.query.lowering_location;
          }

          // Tag filtering
          if (request.query.lowering_tags) {
            if (Array.isArray(request.query.lowering_tags)) {
              query.lowering_tags  = { $in: request.query.lowering_tags };
            }
            else {
              query.lowering_tags  = request.query.lowering_tags;
            }
          }

          //Time filtering
          if ((request.query.startTS) || (request.query.stopTS)) {
            let startTS = new Date('1970-01-01T00:00:00.000Z');
            let stopTS = new Date();

            if (request.query.startTS) {
              startTS = new Date(request.query.startTS);
            }

            if (request.query.stopTS) {
              stopTS = new Date(request.query.stopTS);
            }

            // query.ts = { "$gte": startTS , "$lt": stopTS };
            query.start_ts = { '$lt': stopTS };
            query.stop_ts = { '$gt': startTS };
          }
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        try {
          const lowerings = await db.collection(loweringsTable).find(query).sort( { start_ts: -1 } ).skip(offset).limit(limit).toArray();

          if (lowerings.length > 0) {

            const mod_lowerings = lowerings.map((lowering) => {

              try {
                lowering.lowering_additional_meta.lowering_files = Fs.readdirSync(LOWERING_PATH + '/' + lowering._id);
              }
              catch (error) {
                lowering.lowering_additional_meta.lowering_files = [];
              }

              return _renameAndClearFields(lowering);
            });

            if (request.query.format && request.query.format === 'csv') {

              const flat_lowerings = flattenLoweringObjs(mod_lowerings);

              const csv_headers = buildLoweringCSVHeaders(flat_lowerings);

              const csv_results = await parseAsync(flat_lowerings, { fields: csv_headers });

              return h.response(csv_results).code(200);
            }

            return h.response(mod_lowerings).code(200);
          }

          return Boom.notFound('No records found');

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          query: loweringQuery
        },
        response: {
          status: {
            200: loweringSuccessResponse
          }
        },
        description: 'Return the lowerings based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/lowerings/bycruise/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruiseResult) {
            return Boom.badRequest('No cruise record found for id: ' + request.params.id);
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('unknown error');
        }

        const query = {};

        //Hidden filtering
        if (typeof request.query.hidden !== 'undefined') {

          if (request.auth.credentials.scope.includes('admin')) {
            query.lowering_hidden = request.query.hidden;
          }
          else if (request.query.hidden) {
            return Boom.unauthorized('User not authorized to retrieve hidden lowerings');
          }
          else {
            query.lowering_hidden = false;
          }
        }

        // use access control filtering
        if (useAccessControl && !request.auth.credentials.scope.includes('admin')) {
          query.$or = [{ lowering_hidden: query.lowering_hidden }, { lowering_access_list: request.auth.credentials.id }];
          delete query.lowering_hidden;
        }

        // Lowering_id filtering
        if (request.query.lowering_id) {
          query.lowering_id = request.query.lowering_id;
        }

        // Location filtering
        if (request.query.lowering_location) {
          query.lowering_location = request.query.lowering_location;
        }

        // Tag filtering
        if (request.query.lowering_tags) {
          if (Array.isArray(request.query.lowering_tags)) {
            query.lowering_tags  = { $in: request.query.lowering_tags };
          }
          else {
            query.lowering_tags  = request.query.lowering_tags;
          }
        }

        //Time filtering
        if (request.query.startTS) {
          const tempStartTS = new Date(request.query.startTS);
          const startTS = (tempStartTS >= cruise.start_ts && tempStartTS <= cruise.stop_ts) ? tempStartTS : cruise.start_ts;
          query.start_ts = { $gte: startTS };
        }
        else {
          query.start_ts = { $gte: cruise.start_ts };
        }

        if (request.query.stopTS) {
          const tempStopTS = new Date(request.query.stopTS);
          const stopTS = (tempStopTS >= cruise.start_ts && tempStopTS <= cruise.stop_ts) ? tempStopTS : cruise.stop_ts;
          query.stop_ts = { $lte: stopTS };
        }
        else {
          query.stop_ts = { $lte: cruise.stop_ts };
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        try {
          const lowerings = await db.collection(loweringsTable).find(query).sort( { start_ts: -1 } ).skip(offset).limit(limit).toArray();

          if (lowerings.length > 0) {

            const mod_lowerings = lowerings.map((result) => {

              try {
                result.lowering_additional_meta.lowering_files = Fs.readdirSync(LOWERING_PATH + '/' + result._id);
              }
              catch (error) {
                result.lowering_additional_meta.lowering_files = [];
              }

              return _renameAndClearFields(result);
            });

            if (request.query.format && request.query.format === 'csv') {

              const flat_lowerings = flattenLoweringObjs(mod_lowerings);

              const csv_headers = buildLoweringCSVHeaders(flat_lowerings);

              const csv_results = await parseAsync(flat_lowerings, { fields: csv_headers });

              return h.response(csv_results).code(200);
            }

            return h.response(mod_lowerings).code(200);
          }

          return Boom.notFound('No records found');

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam,
          query: loweringQuery
        },
        response: {
          status: {
            200: loweringSuccessResponse
          }
        },
        description: 'Return the lowerings based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });


    server.route({
      method: 'GET',
      path: '/lowerings/byevent/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let event = null;

        try {
          const eventResult = await db.collection(eventsTable).findOne({ _id: ObjectID(request.params.id) });

          if (!eventResult) {
            return Boom.badRequest('No event record found for id: ' + request.params.id);
          }

          event = eventResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('unknown error');
        }

        const query = {};

        // use access control filtering
        if (useAccessControl && !request.auth.credentials.scope.includes('admin')) {
          query.$or = [{ lowering_hidden: query.lowering_hidden }, { lowering_access_list: request.auth.credentials.id }];
        }
        else if (!request.auth.credentials.scope.includes('admin')) {
          query.lowering_hidden = false;
        }

        // time bounds based on event start/stop times
        query.$and = [{ start_ts: { $lte: event.ts } }, { stop_ts: { $gte: event.ts } }];

        try {
          const lowering = await db.collection(loweringsTable).findOne(query);

          if (lowering) {

            try {
              lowering.lowering_additional_meta.lowering_files = Fs.readdirSync(LOWERING_PATH + '/' + lowering._id);
            }

            catch (error) {
              lowering.lowering_additional_meta.lowering_files = [];
            }

            if (request.query.format && request.query.format === 'csv') {

              const flat_lowerings = flattenLoweringObjs([_renameAndClearFields(lowering)]);

              const csv_headers = buildLoweringCSVHeaders(flat_lowerings);

              const csv_results = await parseAsync(flat_lowerings, { fields: csv_headers });

              return h.response(csv_results).code(200);
            }

            return h.response(_renameAndClearFields(lowering)).code(200);
          }

          return Boom.notFound('No records found');

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: singleLoweringQuery
        },
        response: {
          status: {
            200: loweringSuccessResponse
          }
        },
        description: 'Return the lowerings based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/lowerings/{id}',
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

        let lowering = null;

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && result.lowering_hidden && (useAccessControl && typeof result.lowering_access_list !== 'undefined' && !result.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = result;

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        try {
          lowering.lowering_additional_meta.lowering_files = Fs.readdirSync(LOWERING_PATH + '/' + request.params.id);
        }
        catch (error) {
          lowering.lowering_additional_meta.lowering_files = [];
        }

        if (request.query.format && request.query.format === 'csv') {

          const flat_lowerings = flattenLoweringObjs([_renameAndClearFields(lowering)]);

          const csv_headers = buildLoweringCSVHeaders(flat_lowerings);

          const csv_results = await parseAsync(flat_lowerings, { fields: csv_headers });

          return h.response(csv_results).code(200);
        }

        return h.response(_renameAndClearFields(lowering)).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam,
          query: singleLoweringQuery
        },
        response: {
          status: {
            200: loweringSuccessResponse
          }
        },
        description: 'Return the lowering based on lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });


    server.route({
      method: 'GET',
      path: '/lowerings/{id}/bump',
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

        let lowering = null;

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && result.lowering_hidden && (useAccessControl && typeof result.lowering_access_list !== 'undefined' && !result.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = result;

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        lowering = _renameAndClearFields(lowering);
        server.publish('/ws/status/updateLowerings', lowering);

        return h.response().code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam
        },
        response: {
          status: {}
        },
        description: 'Bump the lowering on the updateLowering websocket subscription',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });


    server.route({
      method: 'POST',
      path: '/lowerings',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const lowering = request.payload;

        if (request.payload.id) {
          try {
            lowering._id = new ObjectID(request.payload.id);
            delete lowering.id;
          }
          catch (err) {
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }

        // Validate date strings
        lowering.start_ts = new Date(request.payload.start_ts);
        lowering.stop_ts = new Date(request.payload.stop_ts);

        if (lowering.start_ts >= lowering.stop_ts) {
          return Boom.badRequest('Start date must be older than stop date');
        }

        if (typeof lowering.lowering_hidden === 'undefined') {
          lowering.lowering_hidden = false;
        }

        // Validate user ids in access list
        if (!lowering.lowering_access_list && useAccessControl) {
          lowering.lowering_access_list = [];
        }
        else if ( lowering.lowering_access_list && lowering.lowering_access_list.length > 0 ) {
          try {
            const users = db.collection(usersTable).toArray();
            const user_ids = users.map((user) => user._id);
            const user_are_valid = lowering.lowering_access_list.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                result = false;
              }

              return result;

            }, true);

            if (!user_are_valid) {
              return Boom.badRequest('lowering_access_list includes invalid user IDs');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        let result = null;
        try {
          result = await db.collection(loweringsTable).insertOne(lowering);
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        try {
          Fs.mkdirSync(LOWERING_PATH + '/' + result.insertedId);
        }
        catch (err) {
          console.log('ERROR:', err);
        }

        lowering.id = result.insertedId;
        server.publish('/ws/status/newLowerings', lowering);

        const cruiseQuery = { start_ts: { '$lte': lowering.start_ts }, stop_ts: { '$gt': lowering.stop_ts } };

        try {
          const loweringCruise = await db.collection(cruisesTable).find(cruiseQuery).toArray();
          loweringCruise.forEach((cruise) => {

            server.publish('/ws/status/updateCruises', cruise);
          });
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        return h.response({ acknowledged: result.acknowledged, insertedId: result.insertedId }).code(201);

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          payload: (useAccessControl) ? loweringCreatePayload : loweringCreatePayloadNoAccessControl,
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
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/lowerings/{id}',
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

        const lowering = request.payload;

        // convert dates
        try {
          if (request.payload.startTS) {
            lowering.start_ts = Date(request.payload.startTS);
          }

          if (request.payload.stopTS) {
            lowering.stop_ts = Date(request.payload.stopTS);
          }
        }
        catch (err) {
          return Boom.badRequest('Unable to parse date string');
        }

        try {

          const result = await db.collection(loweringsTable).findOne(query);

          if (!result) {
            return Boom.badRequest('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && result.lowering_hidden && ( useAccessControl && typeof result.lowering_access_list !== 'undefined' && !result.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to edit this lowering');
          }

          // if a start date and/or stop date is provided, ensure the new date works with the existing date
          if (lowering.start_ts && lowering.stop_ts && (lowering.start_ts >= lowering.stop_ts)) {
            return Boom.badRequest('Start date must be older than stop date');
          }
          else if (lowering.start_ts && lowering.start_ts >= result.stop_ts) {
            return Boom.badRequest('Start date must be older than stop date');
          }
          else if (lowering.stop_ts && result.start_ts >= lowering.stop_ts) {
            return Boom.badRequest('Start date must be older than stop date');
          }

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error', err);
        }

        // Validate user ids in access list
        if ( lowering.lowering_access_list && lowering.lowering_access_list.length > 0 ) {
          try {
            const users = db.collection(usersTable).toArray();
            const user_ids = users.map((user) => user._id);
            const user_are_valid = lowering.lowering_access_list.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                result = false;
              }

              return result;

            }, true);

            if (!user_are_valid) {
              return Boom.badRequest('lowering_access_list include invalid user IDs');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        //move files from tmp directory to permanent directory
        if (request.payload.lowering_additional_meta && request.payload.lowering_additional_meta.lowering_files) {
          try {
            request.payload.lowering_additional_meta.lowering_files.map((file) => {

              mvFilesToDir(Path.join(Tmp.tmpdir,file), Path.join(LOWERING_PATH, request.params.id));
            });
          }
          catch (err) {
            console.log('ERROR:', err);
            return Boom.serverUnavailable('unabled to upload files. Verify directory ' + Path.join(LOWERING_PATH, request.params.id) + ' exists');
          }

          delete request.payload.lowering_files;
        }

        try {
          await db.collection(loweringsTable).updateOne(query, { $set: request.payload });
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        const updatedLowering = await db.collection(loweringsTable).findOne(query);

        updatedLowering.id = updatedLowering._id;
        delete updatedLowering._id;

        server.publish('/ws/status/updateLowerings', updatedLowering);

        const cruiseQuery = { start_ts: { '$lte': updatedLowering.start_ts }, stop_ts: { '$gt': updatedLowering.stop_ts } };

        try {
          const loweringCruise = await db.collection(cruisesTable).find(cruiseQuery).toArray();
          loweringCruise.forEach((cruise) => {

            server.publish('/ws/status/updateCruises', cruise);
          });
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        return h.response().code(204);

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam,
          payload: (useAccessControl) ? loweringUpdatePayload : loweringUpdatePayloadNoAccessControl,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },
        description: 'Update a lowering record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });


    server.route({
      method: 'PATCH',
      path: '/lowerings/{id}/permissions',
      async handler(request, h) {

        if ( !useAccessControl ) {
          Boom.notFound();
        }

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        let lowering = null;

        try {
          lowering = await db.collection(loweringsTable).findOne(query);

          if (!lowering) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        // Validate user ids in access list
        try {
          const users = await db.collection(usersTable).find().toArray();
          const user_ids = users.map((user) => user._id.toString());

          if (request.payload.add) {
            const users_are_valid = request.payload.add.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                console.log('userid:', user_id, 'is invalid');
                result = false;
              }

              return result;

            }, true);

            if (!users_are_valid) {
              return Boom.badRequest('lowering_access_list include invalid user IDs');
            }
          }

          if (request.payload.remove) {
            const users_are_valid = request.payload.remove.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                result = false;
              }

              return result;

            }, true);

            if (!users_are_valid) {
              return Boom.badRequest('lowering_access_list include invalid user IDs');
            }
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (request.payload.remove) {
          try {
            await db.collection(loweringsTable).updateOne(query, { $pull: { lowering_access_list: { $in: request.payload.remove } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        if (request.payload.add) {
          try {
            await db.collection(loweringsTable).updateOne(query, { $push: { lowering_access_list: { $each: request.payload.add } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam,
          payload: (useAccessControl) ? loweringUpdatePermissionsPayload : null,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: { }
        },
        description: 'Update a lowering access permissions',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/lowerings/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        try {
          await db.collection(loweringsTable).deleteOne(query);
          return h.response().code(204);
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam
        },
        response: {
          status: {}
        },
        description: 'Delete a lowering record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/lowerings/all',
      async handler(request, h) {

        const db = request.mongo.db;

        const query = { };

        try {
          await db.collection(loweringsTable).deleteMany(query);
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        try {
          rmDir(LOWERING_PATH);
          if (!Fs.existsSync(LOWERING_PATH)) {
            Fs.mkdirSync(LOWERING_PATH);
          }
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('error deleting lowering files');
        }

        return h.response().code(204);

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
          status: {}
        },
        description: 'Delete ALL lowering records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','api']
      }
    });
  }
};
