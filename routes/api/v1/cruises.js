const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const Fs = require('fs');
const Tmp = require('tmp');
const Path = require('path');

const {
  CRUISE_PATH
} = require('../../../config/path_constants');

const {
  useAccessControl
} = require('../../../config/email_constants');

const {
  cruisesTable,
  loweringsTable,
  usersTable
} = require('../../../config/db_constants');

const _rmDir = (dirPath) => {

  try {
    const files = Fs.readdirSync(dirPath); 

    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const filePath = dirPath + '/' + files[i];
        if (Fs.statSync(filePath).isFile()) {
          Fs.unlinkSync(filePath);
        }
        else {
          _rmDir(filePath);
        }
      }
    }
  }
  catch (err) {
    console.log(err);
    throw err; 
  }

  try {
    Fs.rmdirSync(dirPath);
  }
  catch (err) {
    console.log(err);
    throw err;
  }
};

const _mvFilesToDir = (sourceDirPath, destDirPath) => {

  try {
    const files = Fs.readdirSync(sourceDirPath); 
    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const sourceFilePath = sourceDirPath + '/' + files[i];
        const destFilePath = destDirPath + '/' + files[i];
        if (Fs.statSync(sourceFilePath).isFile()) {
          Fs.renameSync(sourceFilePath, destFilePath);
        }
        else {
          _mvFilesToDir(sourceFilePath, destFilePath);
        }
      }
    }
  }
  catch (err) {
    console.log(err);
    throw err;
  }

  try {
    Fs.rmdirSync(sourceDirPath);
  }
  catch (err) {
    console.log(err);
    throw err;
  }
};

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  if ( !useAccessControl ) {
    delete doc.cruise_access_list;
  }

  return doc;
};


const authorizationHeader = Joi.object({
  authorization: Joi.string().required()
}).options({ allowUnknown: true }).label('authorizationHeader');

const databaseInsertResponse = Joi.object({
  n: Joi.number().integer(),
  ok: Joi.number().integer(),
  insertedCount: Joi.number().integer(),
  insertedId: Joi.object()
}).label('databaseInsertResponse');

const cruiseParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('cruiseParam');

const cruiseTag = Joi.string().label('cruiseTag');

const userID = Joi.string().label('userID');

const cruiseAdditionalMetaCreate = Joi.object({
  cruise_vessel: Joi.string(),
  cruise_pi: Joi.string()
}).options({ allowUnknown: true }).label('cruiseAdditionalMetaCreate');

const cruiseAdditionalMetaUpdate = Joi.object({
  cruise_vessel: Joi.string().optional(),
  cruise_pi: Joi.string().optional()
}).options({ allowUnknown: true }).label('cruiseAdditionalMetaUpdate');

const cruiseQuery = Joi.object({
  startTS: Joi.date().iso(),
  stopTS: Joi.date().iso(),
  hidden: Joi.boolean().optional(),
  cruise_id: Joi.string().optional(),
  cruise_vessel: Joi.string().optional(),
  cruise_location: Joi.string().optional(),
  cruise_pi: Joi.string().optional(),
  cruise_tags: Joi.array().items(cruiseTag).optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional()
}).optional().label('cruiseQuery');

const cruiseResponse = Joi.object({
  id: Joi.object(),
  cruise_id: Joi.string(),
  start_ts: Joi.date().iso(),
  stop_ts: Joi.date().iso(),
  cruise_location: Joi.string().allow(''),
  cruise_additional_meta: cruiseAdditionalMetaCreate,
  cruise_tags: Joi.array().items(cruiseTag),
  cruise_access_list: Joi.array().items(userID),
  cruise_hidden: Joi.boolean()
}).label('cruiseResponse');

const cruiseResponseNoAccessControl = cruiseResponse.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseResponse');

const cruiseCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  cruise_id: Joi.string().required(),
  start_ts: Joi.date().iso().required(),
  stop_ts: Joi.date().iso().required(),
  cruise_location: Joi.string().allow('').required(),
  cruise_additional_meta: cruiseAdditionalMetaCreate.required(),
  cruise_tags: Joi.array().items(cruiseTag).required(),
  cruise_access_list: Joi.array().items(userID).optional(),
  cruise_hidden: Joi.boolean().optional()
}).label('cruiseCreatePayload');

const cruiseCreatePayloadNoAccessControl = cruiseCreatePayload.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseCreatePayload');

const cruiseUpdatePayload = Joi.object({
  cruise_id: Joi.string().optional(),
  start_ts: Joi.date().iso().optional(),
  stop_ts: Joi.date().iso().optional(),
  cruise_location: Joi.string().allow('').optional(),
  cruise_additional_meta: cruiseAdditionalMetaUpdate.optional(),
  cruise_tags: Joi.array().items(cruiseTag).optional(),
  cruise_access_list: Joi.array().items(userID).optional(),
  cruise_hidden: Joi.boolean().optional()
}).required().min(1).label('cruiseUpdatePayload');

const cruiseUpdatePayloadNoAccessControl = cruiseUpdatePayload.keys({ cruise_access_list: Joi.forbidden() }).label('cruiseUpdatePayload');

const cruiseUpdatePermissionsPayload = Joi.object({
  add: Joi.array().items(userID).optional(),
  remove: Joi.array().items(userID).optional()
}).required().min(1).label('cruiseUpdatePermissionsPayload');

exports.plugin = {
  name: 'routes-api-cruises',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    server.route({
      method: 'GET',
      path: '/cruises',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        const query = {};

        //Hidden filtering
        if (typeof request.query.hidden !== "undefined") {

          if (request.auth.credentials.scope.includes('admin')) {
            query.cruise_hidden = request.query.hidden;
          }
          else if (request.query.hidden) {
            return Boom.unauthorized('User not authorized to retrieve hidden cruises');
          }
          else {
            query.cruise_hidden = false;
          }
        }
        else {
          if (!request.auth.credentials.scope.includes('admin')) {
            query.cruise_hidden = false;
          }
        }

        // use access control filtering
        if (useAccessControl && !request.auth.credentials.scope.includes('admin')) {
          query.$or = [{ cruise_hidden: query.cruise_hidden }, { cruise_access_list: request.auth.credentials.id }];
          // query.$or = [{ cruise_hidden: query.cruise_hidden }];
          delete query.cruise_hidden;
        }

        // Cruise ID filtering... if using this then there's no reason to use other filters
        if (request.query.cruise_id) {
          query.cruise_id = request.query.cruise_id;
        }
        else {

          // PI filtering
          if (request.query.cruise_pi) {
            query.cruise_additional_meta.cruise_pi = request.query.cruise_pi;
          }

          // Vessel filtering
          if (request.query.cruise_vessel) {
            query.cruise_additional_meta.cruise_vessel = request.query.cruise_vessel;
          }

          // Location filtering
          if (request.query.cruise_location) {
            query.cruise_location = request.query.cruise_location;
          }

          // Tag filtering
          if (request.query.cruise_tags) {
            if (Array.isArray(request.query.cruise_tags)) {
              query.cruise_tags  = { $in: request.query.cruise_tags };
            }
            else {
              query.cruise_tags  = request.query.cruise_tags;
            }
          }

          // Time filtering
          if ((request.query.startTS) || (request.query.stopTS)) {
            let startTS = new Date("1970-01-01T00:00:00.000Z");
            let stopTS = new Date();

            if (request.query.startTS) {
              startTS = new Date(request.query.startTS);
            }

            if (request.query.stopTS) {
              stopTS = new Date(request.query.stopTS);
            }

            query.start_ts = { "$lt": stopTS };
            query.stop_ts = { "$gt": startTS };
          }
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        try {
          const cruises = await db.collection(cruisesTable).find(query).sort( { start_ts: -1 } ).skip(offset).limit(limit).toArray();

          // console.log("cruises:", cruises);
          if (cruises.length > 0) {

            const mod_cruises = cruises.map((cruise) => {

              try {
                cruise.cruise_additional_meta.cruise_files = Fs.readdirSync(CRUISE_PATH + '/' + cruise._id);
              }
              catch (error) {
                cruise.cruise_additional_meta.cruise_files = [];
              }

              return _renameAndClearFields(cruise);
            });

            return h.response(mod_cruises).code(200);
          }
 
          return Boom.notFound('No records found');
          
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }   
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_cruises']
        },
        validate: {
          headers: authorizationHeader,
          query: cruiseQuery
        },
        response: {
          status: {
            200: Joi.array().items((useAccessControl) ? cruiseResponse : cruiseResponseNoAccessControl)
          }
        },
        description: 'Return the cruises based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/cruises/{id}',
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

        let cruise = null;

        try {
          const result = await db.collection(cruisesTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes("admin") && result.cruise_hidden && (useAccessControl && typeof result.cruise_access_list !== 'undefined' && !result.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = result;

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        try {
          cruise.cruise_additional_meta.cruise_files = Fs.readdirSync(CRUISE_PATH + '/' + request.params.id);
        }
        catch (error) {
          cruise.cruise_additional_meta.cruise_files = [];
        }

        cruise = _renameAndClearFields(cruise);
        return h.response(cruise).code(200);
      },
      config: {
        auth:{
          strategy: 'jwt',
          scope: ['admin', 'read_cruises']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam
        },
        response: {
          status: {
            200: (useAccessControl) ? cruiseResponse : cruiseResponseNoAccessControl
          }
        },
        description: 'Return the cruise based on cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/cruises',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const cruise = request.payload;

        if (request.payload.id) {
          try {
            cruise._id = new ObjectID(request.payload.id);
            delete cruise.id;
          }
          catch (err) {
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }

        // Validate date strings
        cruise.start_ts = new Date(request.payload.start_ts);
        cruise.stop_ts = new Date(request.payload.stop_ts);

        if (cruise.start_ts >= cruise.stop_ts) {
          return Boom.badRequest('Start date must be older than stop date');
        }

        if (typeof cruise.cruise_hidden === 'undefined') {
          cruise.cruise_hidden = false;
        }

        // Validate user ids in access list
        if (!cruise.cruise_access_list && useAccessControl) {
          cruise.cruise_access_list = [];
        }
        else if ( cruise.cruise_access_list && cruise.cruise_access_list.length > 0 ) {
          try {
            const users = db.collection(usersTable).toArray();
            const user_ids = users.map((user) => user._id);
            const user_are_valid = cruise.cruise_access_list.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                result = false;
              }

              return result;

            }, true);

            if (!user_are_valid) {
              return Boom.badRequest('cruise_access_list includes invalid user IDs');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        let result = null;
        try {
          result = await db.collection(cruisesTable).insertOne(cruise);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serverUnavailable('database error', err);
        }

        try {
          Fs.mkdirSync(CRUISE_PATH + '/' + result.insertedId);
        }
        catch (err) {
          console.log("ERROR:", err);
        }

        return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_cruises']
        },
        validate: {
          headers: authorizationHeader,
          payload: (useAccessControl) ? cruiseCreatePayload : cruiseCreatePayloadNoAccessControl,
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
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/cruises/{id}',
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

        const cruise = request.payload;

        // convert dates
        try {
          if (request.payload.startTS) {
            cruise.start_ts = Date(request.payload.startTS);
          }

          if (request.payload.stopTS) {
            cruise.stop_ts = Date(request.payload.stopTS);
          }          
        }
        catch (err) {
          return Boom.badRequest('Unable to parse date string');
        }

        try {
          const result = await db.collection(cruisesTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && result.cruise_hidden && ( useAccessControl && typeof result.cruise_access_list !== 'undefined' && !result.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to edit this cruise');
          }

          // if a start date and/or stop date is provided, ensure the new date works with the existing date
          if (cruise.start_ts && cruise.stop_ts && (cruise.start_ts >= cruise.stop_ts)) {
            return Boom.badRequest('Start date must be older than stop date');
          }
          else if (cruise.start_ts && cruise.start_ts >= result.stop_ts) {
            return Boom.badRequest('Start date must be older than stop date');
          }
          else if (cruise.stop_ts && result.start_ts >= cruise.stop_ts) {
            return Boom.badRequest('Start date must be older than stop date');
          }

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        // Validate user ids in access list
        if ( cruise.cruise_access_list && cruise.cruise_access_list.length > 0 ) {
          try {
            const users = db.collection(usersTable).toArray();
            const user_ids = users.map((user) => user._id);

            const user_are_valid = cruise.cruise_access_list.reduce((result, user_id) => {

              if (!user_ids.includes(user_id)) {
                result = false;
              }

              return result;
            }, true);

            if (!user_are_valid) {
              return Boom.badRequest('cruise_access_list include invalid user IDs');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        //move files from tmp directory to permanent directory
        if (request.payload.cruise_additional_meta && request.payload.cruise_additional_meta.cruise_files) {
          try {
            request.payload.cruise_additional_meta.cruise_files.map((file) => {
              // console.log("move files from", Path.join(Tmp.tmpdir,file), "to", Path.join(CRUISE_PATH, request.params.id));
              _mvFilesToDir(Path.join(Tmp.tmpdir,file), Path.join(CRUISE_PATH, request.params.id));
            });

          }
          catch (err) {
            return Boom.serverUnavailable('unabled to upload files. Verify directory ' + Path.join(CRUISE_PATH, request.params.id) + ' exists', err);
          }

          delete cruise.cruise_additional_meta.cruise_files;
        }

        try {
          await db.collection(cruisesTable).updateOne(query, { $set: cruise });
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        // if cruise_hidden or the cruise_access_list changed, update lowering_access_list for any corresponding lowerings
        if (typeof request.payload.cruise_hidden !== 'undefined' || request.payload.cruise_access_list ) {

          // get the updated cruise
          const result = await db.collection(cruisesTable).findOne(query);

          // build the query for retrieving the affected lowerings
          const start_ts = (cruise.start_ts) ? cruise.start_ts : result.start_ts;
          const stop_ts = (cruise.stop_ts) ? cruise.stop_ts : result.stop_ts;
          const loweringQuery = { start_ts: { "$gte": start_ts }, stop_ts: { "$lt": stop_ts } };

          if (typeof request.payload.cruise_hidden !== 'undefined' && request.payload.cruise_hidden !== result.cruise_hidden) {

            try {
              await db.collection(loweringsTable).updateMany(loweringQuery, { $set: { lowering_hidden: cruise.cruise_hidden } });
            }
            catch (err) {
              return Boom.serverUnavailable('database error', err);
            }
          }

          if (typeof request.payload.cruise_access_list !== 'undefined' && request.payload.cruise_access_list !== result.cruise_access_list) {
            const add = request.payload.cruise_access_list.filter((user) => !result.cruise_access_list.includes(user));
            const remove = result.cruise_access_list.filter((user) => !request.payload.cruise_access_list.includes(user));

            if (remove.length > 0) {
              try {
                await db.collection(loweringsTable).updateMany(loweringQuery, { $pull: { lowering_access_list: { $in: remove } } });
              }
              catch (err) {
                return Boom.serverUnavailable('database error', err);
              }
            }

            if (add.length > 0) {
              try {
                await db.collection(loweringsTable).updateMany(loweringQuery, { $push: { lowering_access_list: { $each: add } } });
              }
              catch (err) {
                return Boom.serverUnavailable('database error', err);
              }
            }
          }
        }

        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_cruises']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam,
          payload: (useAccessControl) ? cruiseUpdatePayload : cruiseUpdatePayloadNoAccessControl,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: { }
        },
        description: 'Update a cruise record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/cruises/{id}/permissions',
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

        let cruise = null;

        try {
          cruise = await db.collection(cruisesTable).findOne(query);

          if (!cruise) {
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
                result = false;
              }

              return result;

            }, true);

            if (!users_are_valid) {
              return Boom.badRequest('cruise_access_list include invalid user IDs');
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
              return Boom.badRequest('cruise_access_list include invalid user IDs');
            }
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (request.payload.remove) {
          try {
            await db.collection(cruisesTable).updateOne(query, { $pull: { cruise_access_list: { $in: request.payload.remove } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        if (request.payload.add) {
          try {
            await db.collection(cruisesTable).updateOne(query, { $push: { cruise_access_list: { $each: request.payload.add } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        // build the query for retrieving the affected lowerings
        const loweringQuery = { start_ts: { "$gte": cruise.start_ts }, stop_ts: { "$lt": cruise.stop_ts } };

        if (request.payload.remove) {
          try {
            await db.collection(loweringsTable).updateMany(loweringQuery, { $pull: { lowering_access_list: { $in: request.payload.remove } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        if (request.payload.add) {
          try {
            await db.collection(loweringsTable).updateMany(loweringQuery, { $push: { lowering_access_list: { $each: request.payload.add } } });
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
          scope: ['admin', 'write_cruises']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam,
          payload: (useAccessControl) ? cruiseUpdatePermissionsPayload : null,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: { }
        },
        description: 'Update a cruise access permissions',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/cruises/{id}',
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
          const result = await db.collection(cruisesTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }  

        try {
          const deleteCruise = await db.collection(cruisesTable).deleteOne(query);
          
          if (Fs.existsSync(CRUISE_PATH + '/' + request.params.id)) {
            _rmDir(CRUISE_PATH + '/' + request.params.id);
          }
          
          return h.response(deleteCruise).code(204);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_cruises']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam
        },
        response: {
          status: {}
        },
        description: 'Delete a cruise record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/cruises/all',
      async handler(request, h) {

        const db = request.mongo.db;

        const query = {};

        try {
          await db.collection(cruisesTable).deleteMany(query);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serverUnavailable('database error', err);
        }

        try {
          _rmDir(CRUISE_PATH);
          if (!Fs.existsSync(CRUISE_PATH)) {
            Fs.mkdirSync(CRUISE_PATH);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serverUnavailable('error deleting cruise files', err);
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
        description: 'Delete ALL cruise records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });
  }
};