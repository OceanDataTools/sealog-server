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
            return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden lowerings" }).code(401);
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
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          query: Joi.object({
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
          }).optional()
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              lowering_id: Joi.string(),
              start_ts: Joi.date().iso(),
              stop_ts: Joi.date().iso(),
              lowering_additional_meta: Joi.object(),
              lowering_tags: Joi.array().items(Joi.string().allow('')),
              lowering_location: Joi.string().allow(''),
              // lowering_access_list: Joi.array().items(Joi.string()),
              lowering_hidden: Joi.boolean()
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
            return h.response({ "statusCode": 404, 'message': 'No cruise record found for id: ' + request.params.id }).code(404);
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden) {
            return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve this cruise" }).code(401);
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return h.response({ statusCode: 503, error: "database error", message: "unknown error" }).code(503);
        }

        const query = {};

        //Hiddle filtering
        if (typeof (request.query.hidden) !== "undefined"){
          if (request.query.hidden && !request.auth.credentials.scope.includes('admin')) {
            return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden lowerings" }).code(401);
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
          scope: ['admin', 'read_lowerings']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          query: Joi.object({
            startTS: Joi.date().iso(),
            stopTS: Joi.date().iso(),
            lowering_location: Joi.string().optional(),
            lowering_tags: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string())
            ).optional(),
            offset: Joi.number().integer().min(0).optional(),
            limit: Joi.number().integer().min(1).optional()
          }).optional()
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              lowering_id: Joi.string(),
              start_ts: Joi.date().iso(),
              stop_ts: Joi.date().iso(),
              lowering_additional_meta: Joi.object(),
              lowering_tags: Joi.array().items(Joi.string().allow('')),
              lowering_location: Joi.string().allow(''),
              // lowering_access_list: Joi.array().items(Joi.string()),
              lowering_hidden: Joi.boolean()
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        let lowering = null;

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (result.lowering_hidden || !result.lowering_access_list.includes(request.auth.credentials.id)) {
            if (result.lowering_hidden) {
              return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve this lowering" }).code(401);
            }
          }

          lowering = result;
        
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
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
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          params: Joi.object({
            id: Joi.string().length(24).required()
          })
        },
        response: {
          status: {
            200: Joi.object({
              id: Joi.object(),
              lowering_id: Joi.string(),
              start_ts: Joi.date().iso(),
              stop_ts: Joi.date().iso(),
              lowering_additional_meta: Joi.object(),
              lowering_tags: Joi.array().items(Joi.string().allow('')),
              lowering_location: Joi.string().allow(''),
              // lowering_access_list: Joi.array().items(Joi.string()),
              lowering_hidden: Joi.boolean()
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
            return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
          }
        }

        // Validate date strings
        lowering.start_ts = new Date(request.payload.start_ts);
        lowering.stop_ts = new Date(request.payload.stop_ts);

        if (lowering.start_ts >= lowering.stop_ts) {
          return h.response({ "statusCode": 401, "error": "Invalid argument", "message": "Start date must be older than stop date" }).code(401);
        }

        try {
          const result = await db.collection(loweringsTable).insertOne(lowering);

          if (!result) {
            return h.response({ "statusCode": 400, 'message': 'Bad request' }).code(400);
          }

          try {
            Fs.mkdirSync(LOWERING_PATH + '/' + result.insertedId);
          }
          catch (err) {
            console.log("ERROR:", err);
          }

          // const cruiseQuery = { start_ts: { "$lte": new Date(lowering.start_ts) }, stop_ts: { "$gte": new Date(lowering.stop_ts) } };
          // try {
          //   const cruiseResult = await db.collection(cruisesTable).findOne(cruiseQuery);

          //   if (cruiseResult && cruiseResult.cruise_access_list.length > 0) {
          //     await db.collection(loweringsTable).updateOne( { _id: result.insertedId }, { $push: { lowering_access_list: { $each: cruiseResult.cruise_access_list } } });
          //   }
          // }
          // catch (err) {
          //   console.log("ERROR:", err);
          // }

          return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_lowerings']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          payload: Joi.object({
            id: Joi.string().length(24).optional(),
            lowering_id: Joi.string().required(),
            start_ts: Joi.date().iso().required(),
            stop_ts: Joi.date().iso().required(),
            lowering_additional_meta: Joi.object().required(),
            lowering_tags: Joi.array().items(Joi.string().allow('')).required(),
            lowering_location: Joi.string().allow('').required(),
            // lowering_access_list: Joi.array().items(Joi.string()).required(),
            lowering_hidden: Joi.boolean().required()
          }),
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        try {

          const result = await db.collection(loweringsTable).findOne(query);

          if (!result) {
            return h.response({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (result.lowering_hidden || !result.lowering_access_list.includes(request.auth.credentials.id)) {
            if (result.lowering_hidden) {
              return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to edit this lowering" }).code(401);
            }
          }

        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
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
            return h.response({ "statusCode": 503, "error": "File Error", 'message': 'unabled to upload files. Verify directory ' + Path.join(LOWERING_PATH, request.params.id) + ' exists'  }).code(503);
          }
          
          delete request.payload.lowering_files;
        }

        try {
          const result = await db.collection(loweringsTable).updateOne(query, { $set: request.payload });
          return h.response(result).code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_lowerings']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          payload: Joi.object({
            lowering_id: Joi.string().optional(),
            start_ts: Joi.date().iso().optional(),
            stop_ts: Joi.date().iso().optional(),
            lowering_additional_meta: Joi.object().optional(),
            lowering_tags: Joi.array().items(Joi.string().allow('')).optional(),
            lowering_location: Joi.string().allow('').optional(),
            // lowering_access_list: Joi.array().items(Joi.string()).optional(),
            lowering_hidden: Joi.boolean().optional()
          }).required().min(1),
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        try {
          const result = await db.collection(loweringsTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }

        try {
          const result = await db.collection(loweringsTable).deleteOne(query);
          return h.response(result).code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_lowerings']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
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
            })
          }
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
            return h.response({ statusCode: 503, error: "filesystem error", message: "unable to delete lowering files" }).code(503);  
          }

          return h.response(result).code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true })
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
        description: 'Delete ALL lowering records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['lowerings','auth','api']
      }
    });
  }
};