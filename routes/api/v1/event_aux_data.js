const Boom = require('@hapi/boom');

const THRESHOLD = 120; //seconds

const {
  useAccessControl
} = require('../../../config/email_constants');

const {
  eventAuxDataTable,
  eventsTable,
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

const {
  buildEventsQuery
} = require('../../../lib/utils');

const {
  authorizationHeader,databaseInsertResponse,auxDataParam,auxDataQuery,auxDataCreatePayload,auxDataUpdatePayload,auxDataSuccessResponse
} = require('../../../lib/validations');

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  return doc;
};


exports.plugin = {
  name: 'routes-api-event_aux_data',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.subscription('/ws/status/newEventAuxData');
    server.subscription('/ws/status/updateEventAuxData');
    server.subscription('/ws/status/deleteEventAuxData');

    server.route({
      method: 'GET',
      path: '/event_aux_data/bycruise/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        let cruise_id = null;

        try {
          cruise_id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: cruise_id });

          if (!cruiseResult) {
            return Boom.badRequest('Cruise not found for id' + request.params.id);
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        const eventQuery = buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);

        try {
          const results = await db.collection(eventsTable).find(eventQuery, { _id: 1 }).sort( { ts: 1 } ).toArray();

          // EventID Filtering
          if (results.length > 0) {
            const query = {};

            const eventIDs = results.map((event) => {

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

              return Boom.notFound('No records found');

            }
            catch (err) {
              return Boom.serverUnavailable('database error', err);
            }
          }
          else {
            return Boom.notFound('No records found');
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: auxDataParam,
          query: auxDataQuery
        },
        response: {
          status: {
            200: auxDataSuccessResponse
          }
        },
        description: 'Return the event_aux_data records for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
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
            return Boom.notFound('lowering not found for that id');
          }

          if (!request.auth.credentials.scope.includes('admin') && loweringResult.lowering_hidden && (useAccessControl && typeof loweringResult.lowering_access_list !== 'undefined' && !loweringResult.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = loweringResult;
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        const eventQuery = buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);

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

              return Boom.notFound('No records found');

            }
            catch (err) {
              return Boom.serverUnavailable('database error', err);
            }
          }
          else {
            return Boom.notFound('No records found');
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: auxDataParam,
          query: auxDataQuery
        },
        response: {
          status: {
            200: auxDataSuccessResponse
          }
        },
        description: 'Return the event_aux_data records for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
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
            return Boom.badRequest('Cannot include param eventID when using author, value, freetext, startTS or stopTS');
          }

          const eventQuery = buildEventsQuery(request);

          try {
            const results = await db.collection(eventsTable).find(eventQuery, { _id: 1 }).sort( { ts: 1 } ).toArray();

            // EventID Filtering
            if (results.length > 0) {
              const query = {};

              const eventIDs = results.map((event) => {

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

                return Boom.notFound('No records found');

              }
              catch (err) {
                return Boom.serverUnavailable('database error', err);
              }
            }
            else {
              return Boom.notFound('No records found');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
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

          try {
            const results = await db.collection(eventAuxDataTable).find(query).skip(offset).limit(limit).toArray();

            if (results.length > 0) {
              results.forEach(_renameAndClearFields);

              return h.response(results).code(200);
            }

            return Boom.notFound('No records found');

          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          query: auxDataQuery
        },
        response: {
          status: {
            200: auxDataSuccessResponse
          }
        },
        description: 'Return the event_aux_data records based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
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
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          const mod_result = _renameAndClearFields(result);
          return h.response(mod_result).code(200);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: auxDataParam
        },
        response: {
          status: {
            200: auxDataSuccessResponse
          }
        },
        description: 'Return the event_aux_data record based on event_aux_data id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data', 'api']
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
              return h.response({ acknowledged: result.acknowledged, insertedId: result.insertedId }).code(201);

            }
            catch (err) {
              if (err.code === 11000) {
                try {
                  const updateResults = await db.collection(eventAuxDataTable).updateOne( { _id: event_aux_data._id }, { $set: event_aux_data } );
                  return h.response(updateResults).code(204);
                }
                catch (err) {
                  return Boom.serverUnavailable('database error', err);
                }
              }
              else {
                return Boom.serverUnavailable('database error', err);
              }
            }
          }
          catch (err) {
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }
        else {

          try {
            event_aux_data.event_id = new ObjectID(request.payload.event_id);
          }
          catch (err) {
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }

          let query = { _id: event_aux_data.event_id };

          try {
            const queryResult = await db.collection(eventsTable).findOne(query);

            if (!queryResult) {
              return Boom.badRequest('event not found');
            }

            query = { event_id: event_aux_data.event_id, data_source: event_aux_data.data_source };

            try {
              const result = await db.collection(eventAuxDataTable).findOne(query);

              if (!result) {
                try {
                  const insertResult = await db.collection(eventAuxDataTable).insertOne(event_aux_data);

                  event_aux_data._id = insertResult.insertedId;
                  _renameAndClearFields(event_aux_data);

                  const diff = (new Date().getTime() - queryResult.ts.getTime()) / 1000;
                  if (Math.abs(Math.round(diff)) < THRESHOLD) {
                    server.publish('/ws/status/newEventAuxData', event_aux_data);
                  }

                  return h.response({ acknowledged: insertResult.acknowledged, insertedId: insertResult.insertedId }).code(201);

                }
                catch (err) {
                  if (err.code === 11000) {
                    try {
                      const updateResults = await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
                      return h.response(updateResults).code(204);
                    }
                    catch (err) {
                      return Boom.serverUnavailable('database error', err);
                    }
                  }
                  else {
                    return Boom.serverUnavailable('database error', err);
                  }
                }
              }
              else {

                query = { _id: new ObjectID(result._id) };

                try {
                  await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
                  return h.response().code(204);
                }
                catch (err) {
                  return Boom.serverUnavailable('database error', err);
                }
              }
            }
            catch (err) {
              return Boom.serverUnavailable('ERROR find aux data:', err);
            }
          }
          catch (err) {
            return Boom.serverUnavailable('ERROR find event:', err);
          }
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          payload: auxDataCreatePayload
        },
        response: {
          status: {
            201: databaseInsertResponse
          }
        },
        description: 'Create a new event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/event_aux_data/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        let event_aux_data = null;
        let result = null;

        try {
          result = await db.collection(eventAuxDataTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }

          event_aux_data = request.payload;

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        try {
          event_aux_data.event_id = new ObjectID(request.payload.event_id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

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
          await db.collection(eventAuxDataTable).updateOne( query, { $set: event_aux_data } );
          return h.response().code(204);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          params: auxDataParam,
          payload: auxDataUpdatePayload
        },
        response: {
          status: {}
        },
        description: 'Update a event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/event_aux_data/{id}',
      async handler(request, h) {

        const db = server.mongo.db;
        const ObjectID = server.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const auxData = await db.collection(eventAuxDataTable).findOne(query);
          if (!auxData) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        try {
          await db.collection(eventAuxDataTable).deleteOne(query);
          return h.response().code(204);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          params: auxDataParam
        },
        response: {
          status: {}
        },
        description: 'Delete an event_aux_data record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['event_aux_data','api']
      }
    });
  }
};
