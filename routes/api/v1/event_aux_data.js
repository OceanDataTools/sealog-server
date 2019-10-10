const Joi = require('@hapi/joi');

const {
  eventAuxDataTable,
  eventsTable,
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  return doc;
};

const _buildEventsQuery = (request, start_ts = new Date("1970-01-01T00:00:00.000Z"), stop_ts = new Date() ) => {

  const query = {};
  if (request.query.author) {
    if (Array.isArray(request.query.author)) {
      const regex_query = request.query.author.map((author) => {

        // return '/' + author + '/i';
        const return_regex = new RegExp(author, 'i');
        return return_regex;
      });

      query.event_author  = { $in: regex_query };
    }
    else {
      query.event_author =  new RegExp(request.query.author, 'i');
    }
  }

  if (request.query.value) {
    if (Array.isArray(request.query.value)) {

      const inList = [];
      const ninList = [];

      for ( const value of request.query.value ) {
        if (value.startsWith("!")) {
          ninList.push( new RegExp(value.substr(1), 'i'));
        }
        else {
          inList.push(new RegExp(value, 'i'));
        }
      }

      if ( inList.length > 0 && ninList.length > 0) {
        query.event_value  = { $in: inList, $nin: ninList };
      }
      else if (inList.length > 0) {
        query.event_value  = { $in: inList };
      }
      else {
        query.event_value  = { $nin: ninList };
      }

    }
    else {
      if (request.query.value.startsWith("!")) {
        query.event_value = new RegExp('^(?!.*' + request.query.value.substr(1) + ')', 'i');
      }
      else {
        query.event_value = new RegExp(request.query.value, 'i');
      }
    }
  }

  if (request.query.freetext) {
    query.event_free_text = new RegExp(request.query.freetext, 'i');
  }

  //Time filtering
  if (request.query.startTS) {
    const tempStartTS = new Date(request.query.startTS);
    const startTS = (tempStartTS >= start_ts && tempStartTS <= stop_ts) ? tempStartTS : start_ts;
    query.ts = { $gte: startTS };
  }
  else {
    query.ts = { $gte: start_ts };
  }

  if (request.query.stopTS) {
    const tempStopTS = new Date(request.query.stopTS);
    const stopTS = (tempStopTS >= start_ts && tempStopTS <= stop_ts) ? tempStopTS : stop_ts;
    query.ts.$lte = stopTS;
  }
  else {
    query.ts.$lte = stop_ts;
  }

  // console.log("query:", query);
  return query;
};

exports.plugin = {
  name: 'routes-api-event_aux_data',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    server.route({
      method: 'GET',
      path: '/event_aux_data/bycruise/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruiseResult) {
            return h.response({ "statusCode": 404, "message": "cruise not found for that id" }).code(404);
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (cruiseResult.cruise_hidden || !cruiseResult.cruise_access_list.includes(request.auth.credentials.id)) {
            if (cruiseResult.cruise_hidden) {
              return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve this cruise" }).code(401);
            }
          }

          cruise = cruiseResult;

        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
        }

        if (cruise.cruise_hidden && !request.auth.credentials.scope.includes("admin")) {
          return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve hidden cruises" }).code(401);
        }

        const eventQuery = _buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);

        // console.log("eventQuery:", eventQuery);

        try {
          const results = await db.collection(eventsTable).find(eventQuery, { _id: 1 }).sort( { ts: 1 } ).toArray();

          // EventID Filtering
          if (results.length > 0) {
            // console.log("results:", results);
            const query = {};

            const eventIDs = results.map((event) => {
              // console.log(event._id);
              return event._id;
            });
            query.event_id = { $in: eventIDs };

            // Datasource Filtering
            if (request.query.datasource) {
              if (Array.isArray(request.query.datasource)) {
                query.data_source  = { $in: request.query.datasource };
              }
              else {
                query.data_source  = request.query.datasource;
              }
            }

            const limit = (request.query.limit) ? request.query.limit : 0;
            const offset = (request.query.offset) ? request.query.offset : 0;

            try {
              const eventAuxDataResults = await db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray();

              if (eventAuxDataResults.length > 0) {
                eventAuxDataResults.forEach(_renameAndClearFields);

                return h.response(eventAuxDataResults).code(200);
              }
 
              return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);
              
            }
            catch (err) {
              console.log("ERROR:", err);
              return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);
            }
          }
          else {
            return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);
          }
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
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          query: Joi.object({
            offset: Joi.number().integer().min(0).optional(),
            limit: Joi.number().integer().min(1).optional(),
            author: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            startTS: Joi.date().iso(),
            stopTS: Joi.date().iso(),
            datasource: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            value: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            freetext: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            )
          }).optional(),
          options: {
            allowUnknown: true
          }
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              event_id: Joi.any(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.any(),
                data_uom: Joi.string()
              }))
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
        description: 'Return the event_aux_data records for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_aux_data/bylowering/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        let lowering = null;

        try {
          const loweringResult = await db.collection(loweringsTable).findOne({ _id: ObjectID(request.params.id) });

          if (!loweringResult) {
            return h.response({ "statusCode": 404, "message": "lowering not found for that id" }).code(404);          
          }

          if (!request.auth.credentials.scope.includes('admin')) {
            // if (loweringResult.lowering_hidden || !loweringResult.lowering_access_list.includes(request.auth.credentials.id)) {
            if (loweringResult.lowering_hidden) {
              return h.response({ "statusCode": 401, "error": "not authorized", "message": "User not authorized to retrieve this lowering" }).code(401);
            }
          }

          lowering = loweringResult;
        }
        catch (err) {
          console.log(err);
          return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
        }

        const eventQuery = _buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);

        try {
          const results = await db.collection(eventsTable).find(eventQuery, { _id: 1 }).sort( { ts: 1 } ).toArray();

          // EventID Filtering
          if (results.length > 0) {
            const query = {};
            const eventIDs = results.map((event) => {

              return event._id;
            });
            query.event_id  = { $in: eventIDs };

            // Datasource Filtering
            if (request.query.datasource) {
              if (Array.isArray(request.query.datasource)) {
                query.data_source  = { $in: request.query.datasource };
              }
              else {
                query.data_source  = request.query.datasource;
              }
            }

            // Limiting & Offset
            const limit = (request.query.limit) ? request.query.limit : 0;
            const offset = (request.query.offset) ? request.query.offset : 0;

            try {
              const auxDataResults = await db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray();

              if (auxDataResults.length > 0) {
                auxDataResults.forEach(_renameAndClearFields);

                return h.response(auxDataResults).code(200);
              }

              return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);

            }
            catch (err) {
              console.log(err);
              return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
            }
          }
          else {
            return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);
          }
        }
        catch (err) {
          console.log(err);
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
          params: Joi.object({
            id: Joi.string().length(24).required()
          }),
          query: Joi.object({
            offset: Joi.number().integer().min(0).optional(),
            limit: Joi.number().integer().min(1).optional(),
            author: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            startTS: Joi.date().iso(),
            stopTS: Joi.date().iso(),
            datasource: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            value: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            freetext: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            )
          }).optional(),
          options: {
            allowUnknown: true
          }
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              event_id: Joi.any(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.any(),
                data_uom: Joi.string()
              }))
            })),
            404: Joi.object({
              statusCode: Joi.number().integer(),
              message: Joi.string()
            }),
            401: Joi.object({
              statusCode: Joi.number().integer(),
              error: Joi.string(),
              message: Joi.string()
            }),
            503: Joi.object({
              statusCode: Joi.number().integer(),
              error: Joi.string(),
              message: Joi.string()
            })

          }
        },
        description: 'Return the event_aux_data records for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_aux_data',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        if (request.query.author || request.query.value || request.query.freetext || request.query.startTS || request.query.stopTS) {

          if (request.query.eventID) {
            return h.response({ "statusCode": 400, "error": 'malformed query', "message": 'Cannot include param eventID when using author, value, freetext, startTS or stopTS' }).code(400);
          }

          const eventQuery = _buildEventsQuery(request);

          // console.log("eventQuery:", eventQuery);

          try {
            const results = await db.collection(eventsTable).find(eventQuery, { _id: 1 }).sort( { ts: 1 } ).toArray();

            // console.log(results);

            // EventID Filtering
            if (results.length > 0) {
              const query = {};

              // console.log("results:", results);
              const eventIDs = results.map((event) => {
                // console.log(event._id);
                return new ObjectID(event._id);
              });
              query.event_id  = { $in: eventIDs };

              // Datasource Filtering
              if (request.query.datasource) {
                if (Array.isArray(request.query.datasource)) {
                  query.data_source  = { $in: request.query.datasource };
                }
                else {
                  query.data_source  = request.query.datasource;
                }
              }

              const limit = (request.query.limit) ? request.query.limit : 0;
              const offset = (request.query.offset) ? request.query.offset : 0;

              try {
                const auxDataResults = await db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray();

                if (auxDataResults.length > 0) {

                  auxDataResults.forEach(_renameAndClearFields);

                  return h.response(auxDataResults).code(200);
                }

                // console.log(auxDataResults);
                return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);

              }
              catch (err) {
                console.log(err);
                return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
              }
            }
            else {
              return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);
            }
          }
          catch (err) {
            console.log(err);
            return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
          }
        }
        else {

          const query = {};

          // EventID Filtering
          if (request.query.eventID) {
            if (Array.isArray(request.query.eventID)) {
              const eventIDs = request.query.eventID.map((id) => {

                return new ObjectID(id);
              });
              query.event_id  = { $in: eventIDs };
            }
            else {
              query.event_id  = new ObjectID(request.query.eventID);
            }
          }

          // Datasource Filtering
          if (request.query.datasource) {
            if (Array.isArray(request.query.datasource)) {
              query.data_source  = { $in: request.query.datasource };
            }
            else {
              query.data_source  = request.query.datasource;
            }
          }

          // Limiting & Offset
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;

          // console.log("query:", query);

          try {
            const results = await db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray();

            if (results.length > 0) {
              results.forEach(_renameAndClearFields);

              return h.response(results).code(200);
            }

            return h.response({ "statusCode": 404, 'message': 'No records found' }).code(404);

          }
          catch (err) {
            console.log(err);
            return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
          }
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
            offset: Joi.number().integer().min(0).optional(),
            limit: Joi.number().integer().min(1).optional(),
            author: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            startTS: Joi.date().iso(),
            stopTS: Joi.date().iso(),
            datasource: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            eventID: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            value: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            ),
            freetext: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(Joi.string()).optional()
            )
          }).optional(),
          options: {
            allowUnknown: true
          }
        },
        response: {
          status: {
            200: Joi.array().items(Joi.object({
              id: Joi.object(),
              event_id: Joi.any(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.any(),
                data_uom: Joi.string()
              }))
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
        description: 'Return the event_aux_data records based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_aux_data/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const query = { _id: new ObjectID(request.params.id) };

        try {
          const result = await db.collection(eventAuxDataTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
          }

          const mod_result = _renameAndClearFields(result);
          return h.response(mod_result).code(200);
        }
        catch (err) {
          console.log(err);
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
              event_id: Joi.any(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.string(),
                data_uom: Joi.string()
              }))
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
        description: 'Return the event_aux_data record based on event_aux_data id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth', 'api']
      }
    });

    server.route({
      method: 'POST',
      path: '/event_aux_data',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const event_aux_data = request.payload;

        // If payload includes a valid _id, try to insert/update
        if (request.payload.id) {
          try {
            event_aux_data._id = new ObjectID(request.payload.id);
            delete event_aux_data.id;
            event_aux_data.event_id = new ObjectID(request.payload.event_id);

            try {
              const result = await db.collection(eventAuxDataTable).insertOne(event_aux_data);
              return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);

            }
            catch (err) {
              if (err.code === 11000) {
                // console.log(event_aux_data)
                try {
                  const updateResults = await db.collection(eventAuxDataTable).updateOne( { _id: event_aux_data._id }, { $set: event_aux_data } );
                  return h.response(updateResults).code(204);
                }
                catch (err) {
                  console.log("ERROR Update 0:", err);
                  return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
                }
              }
              else {
                console.log("ERROR Update Other 0:", err);
                return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
              }
            }
          }
          catch (err) {
            console.log("invalid ObjectID");
            return h.response({ statusCode: 400, error: "Invalid argument", message: "id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
          }
        }
        else {

          try {
            event_aux_data.event_id = new ObjectID(request.payload.event_id);
          }
          catch (err) {
            console.log("invalid event ObjectID");
            return h.response({ statusCode: 400, error: "Invalid argument", message: "event_id must be a single String of 12 bytes or a string of 24 hex characters" }).code(400);
          }

          let query = { _id: event_aux_data.event_id };

          try {
            const queryResult = await db.collection(eventsTable).findOne(query);

            if (!queryResult){
              return h.response({ statusCode:'401', error: 'invalid event_id', message: 'event not found' }).code(401);
            }

            // console.log("queryResult:", queryResult)
            query = { event_id: event_aux_data.event_id, data_source: event_aux_data.data_source };
            // console.log("query1:", query)

            try {
              const result = await db.collection(eventAuxDataTable).findOne(query);

              // console.log("result1:", result)
            
              if (!result){
                // console.log("This is an insert")
                // event_aux_data.event_id = new ObjectID(event_aux_data.event_id);
                try {
                  const insertResult = await db.collection(eventAuxDataTable).insertOne(event_aux_data);
              
                  return h.response({ n: insertResult.result.n, ok: insertResult.result.ok, insertedCount: insertResult.insertedCount, insertedId: insertResult.insertedId }).code(201);

                }
                catch (err) {
                  if (err.code === 11000) {
                    // console.log(event_aux_data)
                    try {
                      const updateResults = await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
                      return h.response(updateResults).code(204);
                    }
                    catch (err) {
                      console.log("ERROR Update 1:", err);
                      return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
                    }
                  }
                  else {
                    console.log("ERROR Update Other 1:", err);
                    return h.response().code(503);
                  }
                }
              }
              else {

                // console.log("This is an update")
                query = { _id: new ObjectID(result._id) };
                // console.log("query:", query)

                try {
                  const updateResults = await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
                  return h.response(updateResults).code(204);
                }
                catch (err) {
                  console.log("ERROR Update 2:", err);
                  return h.response({ statusCode: 503, error: "server error", message: "database error" }).code(503);  
                }
              }    
            }
            catch (err) {
              console.log("ERROR find aux data:", err);
              return h.response().code(503);
            }
          }
          catch (err) {
            console.log("ERROR find event:", err);
            return h.response().code(503);
          }
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
          payload: Joi.object({
            id: Joi.string().length(24).optional(),
            event_id: Joi.string().length(24).required(),
            data_source: Joi.string().min(1).max(100).required(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string().required(),
              data_value: Joi.alternatives().try(
                Joi.string(),
                Joi.number()
              ).required(),
              data_uom:Joi.string().optional()
            })).required().min(1)
          }),
          options: {
            allowUnknown: true
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
        description: 'Create a new event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/event_aux_data/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const query = { _id: new ObjectID(request.params.id) };

        try {
          const result = await db.collection(eventAuxDataTable).findOne(query);

          if (!result) {
            return h.response({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
          }

          const event_aux_data = request.payload;
          if (event_aux_data.data_array) {
            result.data_array.forEach((resultOption) => {

              let foundit = false;
              
              event_aux_data.data_array.forEach((requestOption) => {
              
                if (requestOption.data_name === resultOption.data_name) {
                  requestOption.data_value = resultOption.data_value;
                  
                  if (resultOption.data_uom) {
                    requestOption.data_uom = resultOption.data_uom;
                  }

                  foundit = true;
                }
              });

              if (!foundit) {
                event_aux_data.data_array.push(resultOption);
              }
            });
          }


          try {
            const updateResults = await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
            return h.response(updateResults).code(204);
          }
          catch (err) {
            console.log("ERROR:", err);
            return h.response().code(503);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response().code(503);
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
            event_id: Joi.string().length(24).optional(),
            data_source: Joi.string().min(1).max(100).optional(),
            data_array: Joi.array().items(Joi.object({
              data_name:Joi.string().required(),
              data_value:Joi.string().required(),
              data_uom:Joi.string().optional()
            })).optional()
          }).required().min(1),
          options: {
            allowUnknown: true
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
        description: 'Update a event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/event_aux_data/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const query = { _id: new ObjectID(request.params.id) };

        try {
          const result = await db.collection(eventAuxDataTable).findOne(query);
          if (!result) {
            return h.response({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code();
          }

          try {
            const deleteResult = await db.collection(eventAuxDataTable).deleteOne(query);
            return h.response(deleteResult).code(204);
          }
          catch (err) {
            console.log("ERROR:", err);
            return h.response().code(503);
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return h.response().code(503);
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
            }),
            404: Joi.object({
              statusCode: Joi.number().integer(),
              message: Joi.string()
            })
          }
        },
        description: 'Delete an event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','auth','api']
      }
    });
  }
};
