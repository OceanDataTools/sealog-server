const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const Fs = require('fs');
const Tmp = require('tmp');
const Path = require('path');

const {
  LOWERING_PATH
} = require('../../../config/path_constants');

const {
  cruisesTable,
  loweringsTable
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
  // delete doc.event_id;

  // if(doc.aux_data && doc.aux_data.length > 0) {
  //   doc.aux_data.forEach(_renameAndClearFields);
  // }

  return doc;
};

const authorizationHeader = Joi.object({
  authorization: Joi.string().required()
}).options({ allowUnknown: true }).label('authorizationHeader');

const cruiseParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('cruiseParam');

const loweringParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('loweringParam');

const loweringCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  lowering_id: Joi.string().required(),
  start_ts: Joi.date().iso().required(),
  stop_ts: Joi.date().iso().required(),
  lowering_additional_meta: Joi.object().required(),
  lowering_tags: Joi.array().items(Joi.string().allow('')).required(),
  lowering_location: Joi.string().allow('').required(),
  // lowering_access_list: Joi.array().items(Joi.string()).required(),
  lowering_hidden: Joi.boolean().required()
}).label('loweringCreatePayload');

const loweringUpdatePayload = Joi.object({
  lowering_id: Joi.string().optional(),
  start_ts: Joi.date().iso().optional(),
  stop_ts: Joi.date().iso().optional(),
  lowering_additional_meta: Joi.object().optional(),
  lowering_tags: Joi.array().items(Joi.string().allow('')).optional(),
  lowering_location: Joi.string().allow('').optional(),
  // lowering_access_list: Joi.array().items(Joi.string()).optional(),
  lowering_hidden: Joi.boolean().optional()
}).required().min(1).label('loweringUpdatePayload');

const loweringQuery = Joi.object({
  lowering_id: Joi.string().optional(),
  startTS: Joi.date().iso(),
  stopTS: Joi.date().iso(),
  lowering_location: Joi.string().optional(),
  lowering_tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional()
}).optional().label('loweringQuery');

const loweringSuccessResponse = Joi.object({
  id: Joi.object(),
  lowering_id: Joi.string(),
  start_ts: Joi.date().iso(),
  stop_ts: Joi.date().iso(),
  lowering_additional_meta: Joi.object(),
  lowering_tags: Joi.array().items(Joi.string().allow('')),
  lowering_location: Joi.string().allow(''),
  // lowering_access_list: Joi.array().items(Joi.string()),
  lowering_hidden: Joi.boolean()
});

const loweringCreateResponse = Joi.object({
  n: Joi.number().integer(),
  ok: Joi.number().integer(),
  insertedCount: Joi.number().integer(),
  insertedId: Joi.object()
}).label('loweringCreateResponse');

exports.plugin = {
  name: 'routes-api-lowerings',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    server.route({
      method: 'GET',
      path: '/lowerings',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        const query = {};

        //Hiddle filtering
        if (typeof (request.query.hidden) !== "undefined"){
          if (request.query.hidden && !request.auth.credentials.scope.includes('admin')) {
            return Boom.unauthorized('User not authorized to retrieve hidden lowerings');
          }

          query.lowering_hidden = request.query.hidden;
        }
        else if (!request.auth.credentials.scope.includes('admin')) {
          // const user_id = request.auth.credentials.id;
          query.lowering_hidden = false;
          // query.lowering_access_list = user_id;
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
            let startTS = new Date("1970-01-01T00:00:00.000Z");
            let stopTS = new Date();

            if (request.query.startTS) {
              startTS = new Date(request.query.startTS);
            }

            if (request.query.stopTS) {
              stopTS = new Date(request.query.stopTS);
            }

            // query.ts = { "$gte": startTS , "$lt": stopTS };
            query.start_ts = { "$lt": stopTS };
            query.stop_ts = { "$gt": startTS };
          }
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

            return h.response(mod_lowerings).code(200);
          }
 
          return Boom.notFound('No records found');
          
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
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
            200: Joi.array().items(loweringSuccessResponse)
          }
        },
        description: 'Return the lowerings based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','auth','api']
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
            return Boom.notFound('No cruise record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serviceUnavailable('unknown error');
        }

        const query = {};

        //Hiddle filtering
        if (typeof (request.query.hidden) !== "undefined"){
          if (request.query.hidden && !request.auth.credentials.scope.includes('admin')) {
            return Boom.unauthorized('User not authorized to retrieve hidden lowerings');
          }

          query.lowering_hidden = request.query.hidden;
        }
        else if (!request.auth.credentials.scope.includes('admin')) {
          // const user_id = request.auth.credentials.id;
          query.lowering_hidden = false;
          // query.lowering_access_list = user_id;
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

            return h.response(mod_lowerings).code(200);
          }
 
          return Boom.notFound('No records found');
          
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
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
        tags: ['lowerings','auth','api']
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

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (result.lowering_hidden || !result.lowering_access_list.includes(request.auth.credentials.id)) {
            if (result.lowering_hidden) {
              return Boom.unauthorized('User not authorized to retrieve this lowering');
            }
          }

          lowering = result;
        
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
        }

        try {
          lowering.lowering_additional_meta.lowering_files = Fs.readdirSync(LOWERING_PATH + '/' + request.params.id);
        }
        catch (error) {
          lowering.lowering_additional_meta.lowering_files = [];
        }

        lowering = _renameAndClearFields(lowering);
        return h.response(lowering).code(200);
      },
      config: {
        auth:{
          strategy: 'jwt',
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam
        },
        response: {
          status: {
            200: loweringSuccessResponse
          }
        },
        description: 'Return the lowering based on lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','auth','api']
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

        let result = null;
        try {
          result = await db.collection(loweringsTable).insertOne(lowering);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
        }

        try {
          Fs.mkdirSync(LOWERING_PATH + '/' + result.insertedId);
        }
        catch (err) {
          console.log("ERROR:", err);
        }

        return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
        
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          payload: loweringCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: loweringCreateResponse
          }
        },

        description: 'Create a new event template',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','auth','api']
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

        try {

          const result = await db.collection(loweringsTable).findOne(query);

          if (!result) {
            return Boom.badRequest('No record found for id: ' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (result.lowering_hidden || !result.lowering_access_list.includes(request.auth.credentials.id)) {
            if (result.lowering_hidden) {
              return Boom.unauthorized('User not authorized to edit this lowering');
            }
          }

        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
        }

        if (request.payload.lowering_additional_meta && request.payload.lowering_additional_meta.lowering_files) {
          //move files from tmp directory to permanent directory
          try {
            request.payload.lowering_additional_meta.lowering_files.map((file) => {

              _mvFilesToDir(Path.join(Tmp.tmpdir,file), Path.join(LOWERING_PATH, request.params.id));
            });
          }
          catch (err) {
            console.log("ERROR:", err);
            return Boom.serviceUnavailable('unabled to upload files. Verify directory ' + Path.join(LOWERING_PATH, request.params.id) + ' exists');
          }
          
          delete request.payload.lowering_files;
        }

        try {
          await db.collection(loweringsTable).updateOne(query, { $set: request.payload });
          return h.response().code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_lowerings']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam,
          payload: loweringUpdatePayload,
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
        tags: ['lowerings','auth','api']
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
          console.log("ERROR:", err);
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
        }

        try {
          await db.collection(loweringsTable).deleteOne(query);
          return h.response().code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
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
        tags: ['lowerings','auth','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/lowerings/all',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        const query = { };

        try {
          const result = await db.collection(loweringsTable).deleteMany(query);

          try {
            _rmDir(LOWERING_PATH);
            if (!Fs.existsSync(LOWERING_PATH)) {
              Fs.mkdirSync(LOWERING_PATH);
            }
          }
          catch (err) {
            console.log("ERROR:", err);
            return Boom.serviceUnavailable('unable to delete lowering files');  
          }

          return h.response(result).code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serviceUnavailable('database error');
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
          status: {}
        },
        description: 'Delete ALL lowering records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','auth','api']
      }
    });
  }
};