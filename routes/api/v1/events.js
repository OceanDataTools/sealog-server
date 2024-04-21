const Boom = require('@hapi/boom');
const { AsyncParser } = require('@json2csv/node');

const THRESHOLD = 120; //seconds

const {
  addEventRecordIDs,
  flattenEventObjs,
  buildEventCSVHeaders,
  buildEventsQuery
} = require('../../../lib/utils');

const {
  useAccessControl
} = require('../../../config/email_constants');

const {
  authorizationHeader,
  eventParam,
  eventQuery,
  eventCountSuccessResponse,
  eventSingleQuery,
  eventSuccessResponse,
  eventCreatePayload,
  eventCreateResponse,
  eventUpdatePayload
} = require('../../../lib/validations');

const {
  eventsTable,
  usersTable,
  eventAuxDataTable,
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

const _renameAndClearFields = (doc) => {

  //rename id
  if (doc._id) {
    doc.id = doc._id;
    delete doc._id;
  }

  if (doc.id && typeof doc.id === 'object') {
    doc.id = doc.id.valueOf();
  }

  return doc;
};


exports.plugin = {
  name: 'routes-api-events',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.subscription('/ws/status/newEvents');
    server.subscription('/ws/status/updateEvents');
    server.subscription('/ws/status/deleteEvents');

    server.route({
      method: 'GET',
      path: '/events/bycruise/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruiseResult) {
            return Boom.badRequest('No cruise record found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);
        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;
        const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort(sort).skip(offset).limit(limit).toArray();
          // console.log("results:", results);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length === 0) {
          return Boom.notFound('No records found' );
        }

        // --------- Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          const eventIDs = results.map((event) => event._id);

          datasource_query.event_id = { $in: eventIDs };

          if (Array.isArray(request.query.datasource)) {
            const regex_query = request.query.datasource.map((datasource) => {

              const return_regex = new RegExp(datasource, 'i');
              return return_regex;
            });

            datasource_query.data_source  = { $in: regex_query };
          }
          else {
            datasource_query.data_source  = RegExp(request.query.datasource, 'i');
          }

          let aux_data_results = [];
          try {
            aux_data_results = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const aux_data_eventID_set = new Set(aux_data_results.map((aux_data) => String(aux_data.event_id)));

          results = results.filter((event) => {

            return (aux_data_eventID_set.has(String(event._id))) ? event : null;
          });

        }

        results.forEach(_renameAndClearFields);

        if (request.query.add_record_ids) {
          results = await addEventRecordIDs(request, results);
        }

        if (request.query.format && request.query.format === 'csv') {
          const flat_events = flattenEventObjs(results);
          const csv_headers = buildEventCSVHeaders(flat_events);
          const parser = new AsyncParser({ fields: csv_headers }, {}, {});
          const csv_results = await parser.parse(flat_events).promise();

          return h.response(csv_results).code(200);
        }

        return h.response(results).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventQuery
        },
        response: {
          status: {
            200: eventSuccessResponse
          }
        },
        description: 'Export the events for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });


    server.route({
      method: 'GET',
      path: '/events/bycruise/{id}/count',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruiseResult) {
            return Boom.badRequest('No record cruise found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (cruise.cruise_hidden && !request.auth.credentials.scope.includes('admin')) {
          return Boom.unauthorized('User not authorized to retrieve hidden cruises');
        }

        const query = buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).toArray();
          // console.log("results:", results);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length > 0) {

          // --------- Data source filtering
          if (request.query.datasource) {

            const datasource_query = {};

            const eventIDs = results.map((event) => event._id);

            datasource_query.event_id = { $in: eventIDs };

            if (Array.isArray(request.query.datasource)) {
              const regex_query = request.query.datasource.map((datasource) => {

                const return_regex = new RegExp(datasource, 'i');
                return return_regex;
              });

              datasource_query.data_source  = { $in: regex_query };
            }
            else {
              datasource_query.data_source  = RegExp(request.query.datasource, 'i');
            }

            let aux_data_results = [];
            try {
              aux_data_results = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();
            }
            catch (err) {
              console.log(err);
              return Boom.serverUnavailable('database error');
            }

            const aux_data_eventID_set = new Set(aux_data_results.map((aux_data) => String(aux_data.event_id)));

            results = results.filter((event) => {

              return (aux_data_eventID_set.has(String(event._id))) ? event : null;
            });

          }

          return h.response({ events: results.length }).code(200);
        }

        return h.response({ events: results.length }).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventQuery
        },
        response: {
          status: {
            200: eventCountSuccessResponse
          }
        },
        description: 'Return the number of events for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/events/bylowering/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let lowering = null;

        try {
          const loweringResult = await db.collection(loweringsTable).findOne({ _id: ObjectID(request.params.id) });

          if (!loweringResult) {
            return Boom.badRequest('No record lowering found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && loweringResult.lowering_hidden && (useAccessControl && typeof loweringResult.lowering_access_list !== 'undefined' && !loweringResult.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = loweringResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);
        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;
        const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort(sort).skip(offset).limit(limit).toArray();
          // console.log("results:", results);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length === 0) {
          return Boom.notFound('No records found' );
        }

        // --------- Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          const eventIDs = results.map((event) => event._id);

          datasource_query.event_id = { $in: eventIDs };

          if (Array.isArray(request.query.datasource)) {
            const regex_query = request.query.datasource.map((datasource) => {

              const return_regex = new RegExp(datasource, 'i');
              return return_regex;
            });

            datasource_query.data_source  = { $in: regex_query };
          }
          else {
            datasource_query.data_source  = RegExp(request.query.datasource, 'i');
          }

          let aux_data_results = [];
          try {
            aux_data_results = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const aux_data_eventID_set = new Set(aux_data_results.map((aux_data) => String(aux_data.event_id)));

          results = results.filter((event) => {

            return (aux_data_eventID_set.has(String(event._id))) ? event : null;
          });

        }

        results.forEach(_renameAndClearFields);

        if (request.query.add_record_ids) {
          results = await addEventRecordIDs(request, results);
        }

        if (request.query.format && request.query.format === 'csv') {
          const flat_events = flattenEventObjs(results);
          const csv_headers = buildEventCSVHeaders(flat_events);
          const parser = new AsyncParser({ fields: csv_headers }, {}, {});
          const csv_results = await parser.parse(flat_events).promise();

          return h.response(csv_results).code(200);
        }

        return h.response(results).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventQuery
        },
        response: {
          status: {
            200: eventSuccessResponse
          }
        },
        description: 'Export the events for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });


    server.route({
      method: 'GET',
      path: '/events/bylowering/{id}/count',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let lowering = null;

        try {
          const loweringResult = await db.collection(loweringsTable).findOne({ _id: ObjectID(request.params.id) });

          if (!loweringResult) {
            return Boom.badRequest('No record lowering found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && loweringResult.lowering_hidden && (useAccessControl && typeof loweringResult.lowering_access_list !== 'undefined' && !loweringResult.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = loweringResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).toArray();
          // console.log("results:", results);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length > 0) {

          // --------- Data source filtering
          if (request.query.datasource) {

            const datasource_query = {};

            const eventIDs = results.map((event) => event._id);

            datasource_query.event_id = { $in: eventIDs };

            if (Array.isArray(request.query.datasource)) {
              const regex_query = request.query.datasource.map((datasource) => {

                const return_regex = new RegExp(datasource, 'i');
                return return_regex;
              });

              datasource_query.data_source  = { $in: regex_query };
            }
            else {
              datasource_query.data_source  = RegExp(request.query.datasource, 'i');
            }

            let aux_data_results = [];
            try {
              aux_data_results = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();
            }
            catch (err) {
              console.log(err);
              return Boom.serverUnavailable('database error');
            }

            const aux_data_eventID_set = new Set(aux_data_results.map((aux_data) => String(aux_data.event_id)));

            results = results.filter((event) => {

              return (aux_data_eventID_set.has(String(event._id))) ? event : null;
            });

          }

          return h.response({ events: results.length }).code(200);
        }

        return h.response({ events: results.length }).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventQuery
        },
        response: {
          status: {
            200: eventCountSuccessResponse
          }
        },
        description: 'Export the number of events for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/events',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        let datasourceIDs = {};

        //Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          if (Array.isArray(request.query.datasource)) {
            const regex_query = request.query.datasource.map((datasource) => {

              const return_regex = new RegExp(datasource, 'i');
              return return_regex;
            });

            datasource_query.data_source  = { $in: regex_query };
          }
          else {
            datasource_query.data_source  = RegExp(request.query.datasource, 'i');
          }

          try {

            const collection = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();

            const eventIDs = collection.map((x) => x.event_id);

            // console.log("collection:", eventIDs);

            datasourceIDs = { $in: eventIDs };

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const query = buildEventsQuery(request);
          query._id = datasourceIDs;
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

          try {
            const results = await db.collection(eventsTable).find(query).sort(sort).skip(offset).limit(limit).toArray();
            // console.log("results:", results);

            if (results.length > 0) {
              results.forEach(_renameAndClearFields);
              return h.response(results).code(200);
            }

            return Boom.notFound('No records found' );

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

        }
        else {

          const query = buildEventsQuery(request);
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

          try {
            let results = await db.collection(eventsTable).find(query).sort(sort).skip(offset).limit(limit).toArray();
            // console.log("results:", results);

            if (results.length === 0) {
              return Boom.notFound('No records found' );
            }

            results.forEach(_renameAndClearFields);

            if (request.query.add_record_ids) {
              results = await addEventRecordIDs(request, results);
            }

            if (request.query.format && request.query.format === 'csv') {
              const flat_events = flattenEventObjs(results);
              const csv_headers = buildEventCSVHeaders(flat_events);
              const parser = new AsyncParser({ fields: csv_headers }, {}, {});
              const csv_results = await parser.parse(flat_events).promise();

              return h.response(csv_results).code(200);
            }

            return h.response(results).code(200);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
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
          query: eventQuery
        },
        response: {
          status: {
            200: eventSuccessResponse
          }
        },
        description: 'Return the events based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });


    server.route({
      method: 'GET',
      path: '/events/count',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        let datasourceIDs = {};

        //Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          if (Array.isArray(request.query.datasource)) {
            const regex_query = request.query.datasource.map((datasource) => {

              const return_regex = new RegExp(datasource, 'i');
              return return_regex;
            });

            datasource_query.data_source  = { $in: regex_query };
          }
          else {
            datasource_query.data_source  = RegExp(request.query.datasource, 'i');
          }

          try {

            const collection = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();

            const eventIDs = collection.map((x) => x.event_id);

            datasourceIDs = { $in: eventIDs };

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const query = buildEventsQuery(request);
          query._id = datasourceIDs;

          try {
            const results = await db.collection(eventsTable).find(query).toArray();

            return h.response({ 'events': results.length }).code(200);

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

        }
        else {

          const query = buildEventsQuery(request);

          try {
            const results = await db.collection(eventsTable).find(query).toArray();

            return h.response({ 'events': results.length }).code(200);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
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
          query: eventQuery
        },
        response: {
          status: {
            200: eventCountSuccessResponse
          }
        },
        description: 'Return the number of events based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events', 'api']
      }
    });



    server.route({
      method: 'GET',
      path: '/events/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = { _id: ObjectID(request.params.id) };

        try {
          let result = await db.collection(eventsTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id );
          }

          result = _renameAndClearFields(result);

          if (request.query.add_record_ids) {
            const temp = await addEventRecordIDs(request, [result]);
            result = temp[0];
          }

          if (request.query.format && request.query.format === 'csv') {
            const flat_events = flattenEventObjs([result]);
            const csv_headers = buildEventCSVHeaders(flat_events);
            const parser = new AsyncParser({ fields: csv_headers }, {}, {});
            const csv_results = await parser.parse(flat_events).promise();

            return h.response(csv_results).code(200);
          }

          return h.response(result).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventSingleQuery
        },
        response: {
          status: {
            200: eventSuccessResponse
          }
        },
        description: 'Return an event based on the event id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/events',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const event = request.payload;

        if (event.id) {
          try {
            event._id = new ObjectID(event.id);
            delete event.id;
          }
          catch (err) {
            console.log(err);
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }

          const result = await db.collection(eventsTable).findOne({ _id: event._id });
          if (result) {
            return Boom.badRequest('duplicate event ID');
          }
        }

        if (!event.ts) {
          event.ts = new Date();
        }

        if (!event.event_options) {
          event.event_options = [];
        }
        else {
          event.event_options = event.event_options.map((event_option) => {

            event_option.event_option_name = event_option.event_option_name.toLowerCase().replace(/\s+/g, '_');
            return event_option;
          });
        }

        if (!event.event_free_text) {
          event.event_free_text = '';
        }

        if (!event.event_author) {
          try {
            const result = await db.collection(usersTable).findOne({ _id: new ObjectID(request.auth.credentials.id) });

            if (!result) {
              return Boom.badRequest('specified user does not exist');
            }

            event.event_author = result.username;

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }
        }

        const publish = event.publish || true;
        delete event.publish;

        try {
          const result = await db.collection(eventsTable).insertOne(event);

          event._id = result.insertedId;
          _renameAndClearFields(event);

          const diff = (new Date().getTime() - event.ts.getTime()) / 1000;
          if (publish && Math.abs(Math.round(diff)) < THRESHOLD) {
            server.publish('/ws/status/newEvents', event);
          }

          return h.response({ ...result, insertedEvent: event }).code(201);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          payload: eventCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: eventCreateResponse
          }
        },

        description: 'Create a new event record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['events','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/events/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};
        let time_change = false;

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          console.log(err);
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(eventsTable).findOne(query);

          if (!result) {
            return Boom.badRequest('No event record found for id: ' + request.params.id);
          }

          if (request.payload.ts && result.ts.getTime() !== request.payload.ts.getTime()) {
            time_change = true;
          }
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const event = request.payload;

        if (event.event_options) {
          const temp_event_options = event.event_options.map((event_option) => {

            event_option.event_option_name = event_option.event_option_name.toLowerCase().replace(/\s+/g, '_');
            return event_option;
          });


          temp_event_options.forEach((requestOption) => {

            let foundit = false;
            event.event_options.forEach((event_option) => {

              if (event_option.event_option_name === requestOption.event_option_name) {
                event_option.event_option_value = requestOption.event_option_value;
                foundit = true;
              }
            });

            if (!foundit) {
              event.event_options.push(requestOption);
            }
          });
        }

        if (event.ts) {
          event.ts = new Date(event.ts);
        }

        try {
          // const result = await db.collection(eventsTable).findOneAndUpdate(query, { $set: request.payload },{ returnDocument: 'after' });
          const result = await db.collection(eventsTable).findOneAndUpdate(query, { $set: event },{ returnDocument: 'after' });
          const updatedEvent = _renameAndClearFields(result.value);

          if (time_change) {
            server.publish('/ws/status/deleteEvents', updatedEvent);

            // delete any aux_data
            const aux_data_query = { event_id: updatedEvent.id };
            // console.log(result.value);
            // console.log(aux_data_query);

            await db.collection(eventAuxDataTable).deleteMany(aux_data_query);
            // console.log(del_results);

            server.publish('/ws/status/newEvents', updatedEvent);

          }
          else {
            server.publish('/ws/status/updateEvents', updatedEvent);
          }

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
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          payload: eventUpdatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },
        description: 'Update an event record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['events','api']
      }
    });


    server.route({
      method: 'DELETE',
      path: '/events',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        let datasourceIDs = {};

        //Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          if (Array.isArray(request.query.datasource)) {
            const regex_query = request.query.datasource.map((datasource) => {

              const return_regex = new RegExp(datasource, 'i');
              return return_regex;
            });

            datasource_query.data_source  = { $in: regex_query };
          }
          else {
            datasource_query.data_source  = RegExp(request.query.datasource, 'i');
          }

          try {

            const collection = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();

            const eventIDs = collection.map((x) => x.event_id);

            datasourceIDs = { $in: eventIDs };

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const query = buildEventsQuery(request);
          query._id = datasourceIDs;
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

          let eventIDs = [];

          // find the events
          try {
            const results = await db.collection(eventsTable).find(query).sort(sort).project({ _id: 1 }).skip(offset).limit(limit).toArray(); // should return just the ids
            // console.log("results:",results);

            if (results.length === 0) {
              return h.response({ deletedCount: 0 }).code(200);
            }

            eventIDs = results.map((x) => x._id);
            // console.log("eventIDs:",eventIDs);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          // delete the aux_data records
          try {
            await db.collection(eventAuxDataTable).deleteMany({ event_id: { $in: eventIDs } });
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          // delete the event records
          try {
            const results = await db.collection(eventsTable).deleteMany({ _id: { $in: eventIDs } });
            return h.response({ deletedCount: results.deletedCount }).code(200);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }
        }
        else {

          const query = buildEventsQuery(request);
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === 'newest') ? { ts: -1 } : { ts: 1 };

          let eventIDs = [];

          // find the events
          try {
            const results = await db.collection(eventsTable).find(query).sort(sort).project({ _id: 1 }).skip(offset).limit(limit).toArray();
            // console.log("results:", results);

            if (results.length === 0) {
              return h.response({ deletedCount: 0 }).code(200);
            }

            eventIDs = results.map((x) => x._id);
            // console.log("eventIDs:",eventIDs);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          // delete the aux_data records
          try {
            await db.collection(eventAuxDataTable).deleteMany({ event_id: { $in: eventIDs } });
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          // delete the event records
          try {
            const results = await db.collection(eventsTable).deleteMany({ _id: { $in: eventIDs } });
            return h.response({ deletedCount: results.deletedCount }).code(200);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          query: eventQuery
        },
        response: {
          status: {}
        },
        description: 'Delete multiple event records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['events','api']
      }
    });


    server.route({
      method: 'DELETE',
      path: '/events/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          console.log(err);
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        let event = null;

        try {
          const result = await db.collection(eventsTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id );
          }

          event = result;

        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        try {
          const aux_data_result = await db.collection(eventAuxDataTable).find({ event_id: new ObjectID(request.params.id) }).toArray();

          event.aux_data = aux_data_result;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        try {
          await db.collection(eventsTable).findOneAndDelete(query);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        try {
          await db.collection(eventAuxDataTable).deleteMany({ event_id: new ObjectID(request.params.id) });
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        server.publish('/ws/status/deleteEvents', _renameAndClearFields(event));

        return h.response().code(204);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam
        },
        response: {
          status: {}
        },
        description: 'Delete an event record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['events','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/events/all',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        try {
          await db.collection(eventsTable).deleteMany();
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        try {
          await db.collection(eventAuxDataTable).deleteMany();
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
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader
        },
        response: {
          status: {}
        },
        description: 'Delete ALL the event records',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['events','api']
      }
    });
  }
};
