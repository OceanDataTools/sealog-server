const Joi = require('@hapi/joi');
const Fs = require('fs');
const Tmp = require('tmp');
const Path = require('path');

const {
  CRUISE_PATH
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

  return doc;
};


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
        if (typeof (request.query.hidden) !== "undefined"){
          if (request.query.hidden && !request.auth.credentials.scope.includes('admin')) {
            return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden cruises" }).code(401);
          }

          query.cruise_hidden = request.query.hidden;
        }
        else if (!request.auth.credentials.scope.includes('admin')) {
          // const user_id = request.auth.credentials.id;
          // query.cruise_access_list = user_id;
          query.cruise_hidden = false;
        }

        // Cruise ID filtering... if using this then there's no reason to use other filters
        if (request.query.cruise_id) {
          query.cruise_id = request.query.cruise_id;
        }
        else {

          // PI filtering
          if (request.query.cruise_pi) {
            query.cruise_pi = request.query.cruise_pi;
          }

          // Vessel filtering
          if (request.query.cruise_vessel) {
            query.cruise_vessel = request.query.cruise_vessel;
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

            // query.ts = { "$gte": startTS , "$lt": stopTS };
            query.start_ts = { "$lt": stopTS };
            query.stop_ts = { "$gt": startTS };
          }
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        try {
          const cruises = await db.collection(cruisesTable).find(query).sort( { start_ts: -1 } ).skip(offset).limit(limit).toArray();

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
          scope: ['admin', 'read_cruises']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          query: Joi.object({
            startTS: Joi.date().iso(),
            stopTS: Joi.date().iso(),
            hidden: Joi.boolean().optional(),
            cruise_id: Joi.string().optional(),
            cruise_vessel: Joi.string().optional(),
            cruise_location: Joi.string().optional(),
            cruise_pi: Joi.string().optional(),
            cruise_tags: Joi.alternatives().try(
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
              cruise_id: Joi.string(),
              cruise_location: Joi.string().allow(''),
              cruise_vessel: Joi.string(),
              start_ts: Joi.date().iso(),
              stop_ts: Joi.date().iso(),
              cruise_pi: Joi.string().allow(''),
              cruise_additional_meta: Joi.object(),
              cruise_tags: Joi.array().items(Joi.string().allow('')),
              // cruise_access_list: Joi.array().items(Joi.string()),
              cruise_hidden: Joi.boolean()
            })),
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        let cruise = null;

        try {
          const result = await db.collection(cruisesTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (result.cruise_hidden || !result.cruise_access_list.includes(request.auth.credentials.id)) {
            if (result.cruise_hidden) {
              return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve this cruise" }).code(401);
            }
          }

          cruise = result;

        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
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
              cruise_id: Joi.string(),
              cruise_location: Joi.string().allow(''),
              cruise_vessel: Joi.string(),
              start_ts: Joi.date().iso(),
              stop_ts: Joi.date().iso(),
              cruise_pi: Joi.string().allow(''),
              cruise_additional_meta: Joi.object(),
              cruise_tags: Joi.array().items(Joi.string().allow('')),
              // cruise_access_list: Joi.array().items(Joi.string()),
              cruise_hidden: Joi.boolean()
            }),
            401: Joi.object({
              statusCode: Joi.number().integer(),
              error: Joi.string(),
              message: Joi.string()
            }),
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
            return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
          }
        }

        // Validate date strings
        cruise.start_ts = new Date(request.payload.startTS);
        cruise.stop_ts = new Date(request.payload.stopTS);

        if (cruise.start_ts >= cruise.stop_ts) {
          return h.response({ "statusCode": 401, "error": "Invalid argument", "message": "Start date must be older than stop date" }).code(401);
        }

        try {
          const result = await db.collection(cruisesTable).insertOne(cruise);

          if (!result) {
            return h.response({ "statusCode": 400, 'message': 'Bad request' }).code(400);
          }

          try {
            Fs.mkdirSync(CRUISE_PATH + '/' + result.insertedId);
          }
          catch (err) {
            console.log(err);
          }

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
          scope: ['admin', 'create_cruises']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          payload: Joi.object({
            id: Joi.string().length(24).optional(),
            cruise_id: Joi.string().required(),
            start_ts: Joi.date().iso().required(),
            stop_ts: Joi.date().iso().required(),
            cruise_pi: Joi.string().allow('').required(),
            cruise_location: Joi.string().allow('').required(),
            cruise_vessel: Joi.string().required(),
            cruise_additional_meta: Joi.object().required(),
            cruise_tags: Joi.array().items(Joi.string().allow('')).required(),
            // cruise_access_list: Joi.array().items(Joi.string()).required(),
            cruise_hidden: Joi.boolean().required()
          })
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        const cruise = request.payload;

        try {
          const result = await db.collection(cruisesTable).findOne(query);

          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          // if only a start or stop date is provided, ensure the new date works with the existing date
          if (!(request.payload.startTS && request.payload.stopTS)) {
            if (request.payload.startTS && result.stop_ts && Date(request.payload.startTS) >= result.stop_ts) {
              return h.response({ "statusCode": 401, "error": "Invalid argument", "message": "Start date must be older than stop date" }).code(401);
            }
            else if (request.payload.stopTS && result.start_ts && Date(request.payload.stopTS) <= result.start_ts) {
              return h.response({ "statusCode": 401, "error": "Invalid argument", "message": "Start date must be older than stop date" }).code(401);
            }

            if (!request.auth.credentials.scope.includes('admin')) {
              // if (result.cruise_hidden || !result.cruise_access_list.includes(request.auth.credentials.id)) {
              if (result.cruise_hidden) {
                return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to edit this cruise" }).code(401);
              }
            }
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
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
            return h.response({ "statusCode": 503, "error": "File Error", 'message': 'unabled to upload files. Verify directory ' + Path.join(CRUISE_PATH, request.params.id) + ' exists'  }).code(503);
          }

          delete cruise.cruise_additional_meta.cruise_files;
        }

        // Validate date strings
        if (request.query.startTS) {
          cruise.start_ts = new Date(request.query.startTS);
        }

        if (request.query.stopTS) {
          cruise.stop_ts = new Date(request.query.stopTS);
        }

        if (cruise.start_ts && cruise.stop_ts && cruise.start_ts >= cruise.stop_ts) {
          return h.response({ "statusCode": 401, "error": "Invalid argument", "message": "Start date must be older than stop date" }).code(401);
        }

        try {
          await db.collection(cruisesTable).updateOne(query, { $set: cruise });
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }

        if (typeof (cruise.cruise_hidden) !== 'undefined') {
          const result = await db.collection(cruisesTable).findOne(query);

          if (cruise.cruise_hidden !== result.cruise_hidden) {

            cruise.start_ts = (cruise.start_ts) ? cruise.start_ts : result.start_ts;
            cruise.stop_ts = (cruise.stop_ts) ? cruise.stop_ts : result.stop_ts;
            const loweringQuery = { start_ts: { "$gte": cruise.start_ts }, stop_ts: { "$lt": cruise.stop_ts } };
            try {
              await db.collection(loweringsTable).updateMany(loweringQuery, { $set: { lowering_hidden: cruise.cruise_hidden } });
            }
            catch (err) {
              console.log("ERROR:", err);
              return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
            }
          }
        }
        // if (request.payload.cruise_access_list && request.payload.cruise_access_list !== cruise.cruise_access_list) {
        //   const add = request.payload.cruise_access_list.filter((user) => !cruise.cruise_access_list.includes(user));
        //   const remove = cruise.cruise_access_list.filter((user) => !request.payload.cruise_access_list.includes(user));

        //   const loweringQuery = { start_ts: { "$gte": new Date(cruise.start_ts) }, stop_ts: { "$lt": new Date(cruise.stop_ts) } };

        //   if (remove.length > 0) {
        //     try {
        //       await db.collection(loweringsTable).updateMany(loweringQuery, { $pull: { lowering_access_list: { $in: remove } } });
        //     }
        //     catch (err) {
        //       console.log("ERROR:", err);
        //       return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        //     }
        //   }

        //   if (add.length > 0) {
        //     try {
        //       await db.collection(loweringsTable).updateMany(loweringQuery, { $push: { lowering_access_list: { $each: add } } });
        //     }
        //     catch (err) {
        //       console.log("ERROR:", err);
        //       return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        //     }
        //   }
        // }

        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_cruises']
        },
        validate: {
          headers: Joi.object({
            authorization: Joi.string().required()
          }).options({ allowUnknown: true }),
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          payload: Joi.object({
            cruise_id: Joi.string().optional(),
            start_ts: Joi.date().iso().optional(),
            stop_ts: Joi.date().iso().optional(),
            cruise_location: Joi.string().allow('').optional(),
            cruise_vessel: Joi.string().optional(),
            cruise_pi: Joi.string().allow('').optional(),
            cruise_additional_meta: Joi.object().optional(),
            cruise_tags: Joi.array().items(Joi.string()).optional(),
            // cruise_access_list: Joi.array().items(Joi.string()).optional(),
            cruise_hidden: Joi.boolean().optional()
          }).required().min(1)
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
        description: 'Update a cruise record',
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
          return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
        }

        try {
          const result = await db.collection(cruisesTable).findOne(query);

          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }  

        try {
          const deleteCruise = await db.collection(cruisesTable).deleteOne(query);
          
          if (Fs.existsSync(CRUISE_PATH + '/' + request.params.id)) {
            _rmDir(CRUISE_PATH + '/' + request.params.id);
          }
          
          return h.response(deleteCruise).code(204);
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'create_cruises']
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
            204: Joi.object(),
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
        // const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          const result = await db.collection(cruisesTable).deleteMany(query);

          _rmDir(CRUISE_PATH);
          if (!Fs.existsSync(CRUISE_PATH)) {
            Fs.mkdirSync(CRUISE_PATH);
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
            204: Joi.object(),
            503: Joi.object({
              statusCode: Joi.number().integer(),
              error: Joi.string(),
              message: Joi.string()
            })
          }
        },
        description: 'Delete ALL cruise records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['cruises','auth','api']
      }
    });
  }
};