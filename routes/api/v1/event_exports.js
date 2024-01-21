const Boom = require('@hapi/boom');
const { AsyncParser } = require('@json2csv/node');

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
  eventsTable,
  eventAuxDataTable,
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  if (doc.aux_data && doc.aux_data.length > 0) {
    doc.aux_data.forEach((aux) => {

      delete aux._id;
      delete aux.event_id;
    });
  }

  return doc;
};

const {
  authorizationHeader,eventParam,eventExportQuery,eventExportSingleQuery,eventExportSuccessResponse
} = require('../../../lib/validations');

exports.plugin = {
  name: 'routes-api-event-exports',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.route({
      method: 'GET',
      path: '/event_exports/bycruise/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let cruise = null;

        try {
          const cruiseResult = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruiseResult) {
            return Boom.notFound('cruise not found for that id');
          }

          if (!request.auth.credentials.scope.includes('admin') && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;

        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        const query = buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);
        const offset = (request.query.offset) ? request.query.offset : 0;

        const lookup = {
          from: eventAuxDataTable,
          localField: '_id',
          foreignField: 'event_id',
          as: 'aux_data'
        };

        const aggregate = [];
        aggregate.push({ $match: query });
        aggregate.push({ $lookup: lookup });
        aggregate.push({ $sort: { ts: 1 } });

        if (request.query.limit) {
          aggregate.push({ $limit: request.query.limit });
        }

        // console.log("aggregate:", aggregate);
        let results = [];

        try {
          results = await db.collection(eventsTable).aggregate(aggregate, { allowDiskUse: true }).skip(offset).toArray();
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length > 0) {

          // datasource filtering
          if (request.query.datasource) {

            const datasource_query = {};

            const eventIDs = results.map((event) => event._id);

            datasource_query.event_id = { $in: eventIDs };

            if (Array.isArray(request.query.datasource)) {
              datasource_query.data_source  = { $in: request.query.datasource };
            }
            else {
              datasource_query.data_source  = request.query.datasource;
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
        }

        return Boom.notFound('No records found');
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventExportQuery
        },
        response: {
          status: {
            200: eventExportSuccessResponse
          }
        },
        description: 'Export the events merged with their event_aux_data records for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['event_exports','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_exports/bylowering/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

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
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        if (lowering.lowering_hidden && !request.auth.credentials.scope.includes('admin')) {
          return Boom.unauthorized('User not authorized to retrieve hidden lowerings');
        }

        const query = buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);
        const offset = (request.query.offset) ? request.query.offset : 0;

        const lookup = {
          from: eventAuxDataTable,
          localField: '_id',
          foreignField: 'event_id',
          as: 'aux_data'
        };

        const aggregate = [];
        aggregate.push({ $match: query });
        aggregate.push({ $lookup: lookup });
        aggregate.push({ $sort: { ts: 1 } });

        if (request.query.limit) {
          aggregate.push({ $limit: request.query.limit });
        }

        // console.log("aggregate:", aggregate);
        let results = [];

        try {
          results = await db.collection(eventsTable).aggregate(aggregate, { allowDiskUse: true }).skip(offset).toArray();
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (results.length > 0) {

          // datasource filtering
          if (request.query.datasource) {

            const datasource_query = {};

            const eventIDs = results.map((event) => event._id);

            datasource_query.event_id = { $in: eventIDs };

            if (Array.isArray(request.query.datasource)) {
              datasource_query.data_source  = { $in: request.query.datasource };
            }
            else {
              datasource_query.data_source  = request.query.datasource;
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
        }

        return Boom.notFound('No records found');
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam,
          query: eventExportQuery
        },
        response: {
          status: {
            200: eventExportSuccessResponse
          }
        },
        description: 'Export the events merged with their event_aux_data records for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['event_exports','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_exports',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        //Data source filtering
        if (request.query.datasource) {

          const datasource_query = {};

          if (Array.isArray(request.query.datasource)) {
            datasource_query.data_source  = { $in: request.query.datasource };
          }
          else {
            datasource_query.data_source  = request.query.datasource;
          }

          let eventIDs = [];

          try {
            const collection = await db.collection(eventAuxDataTable).find(datasource_query, { _id: 0, event_id: 1 }).toArray();
            eventIDs = collection.map((x) => x.event_id);
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const query = buildEventsQuery(request);
          query._id = { $in: eventIDs };
          const offset = (request.query.offset) ? request.query.offset : 0;

          const lookup = {
            from: eventAuxDataTable,
            localField: '_id',
            foreignField: 'event_id',
            as: 'aux_data'
          };

          const aggregate = [];
          aggregate.push({ $match: query });
          aggregate.push({ $lookup: lookup });
          aggregate.push({ $sort: { ts: 1 } });

          if (request.query.limit) {
            aggregate.push({ $limit: request.query.limit });
          }

          try {
            const results = await db.collection(eventsTable).aggregate(aggregate, { allowDiskUse: true }).skip(offset).toArray();

            if (results.length > 0) {
              results.forEach(_renameAndClearFields);
              return h.response(results).code(200);
            }

            return Boom.notFound('No records found');

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }
        }
        else {

          const query = buildEventsQuery(request);
          const offset = (request.query.offset) ? request.query.offset : 0;

          const lookup = {
            from: eventAuxDataTable,
            localField: '_id',
            foreignField: 'event_id',
            as: 'aux_data'
          };

          const aggregate = [];
          aggregate.push({ $match: query });
          aggregate.push({ $lookup: lookup });
          aggregate.push({ $sort: { ts: 1 } });

          if (request.query.limit) {
            aggregate.push({ $limit: request.query.limit });
          }

          // console.log("aggregate:", aggregate);

          try {
            let results = await db.collection(eventsTable).aggregate(aggregate, { allowDiskUse: true }).skip(offset).toArray();

            if (results.length > 0) {
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

            return Boom.notFound('No records found');
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
          query: eventExportQuery
        },
        response: {
          status: {
            200: eventExportSuccessResponse
          }
        },
        description: 'Export events merged with their aux_data based on the query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['event_exports','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/event_exports/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = { _id: new ObjectID(request.params.id) };

        const lookup = {
          from: eventAuxDataTable,
          localField: '_id',
          foreignField: 'event_id',
          as: 'aux_data'
        };

        const aggregate = [];
        aggregate.push({ $match: query });
        aggregate.push({ $lookup: lookup });

        // console.log(aggregate)

        try {
          let results = await db.collection(eventsTable).aggregate(aggregate, { allowDiskUse: true }).toArray();

          if (results.length === 0) {
            return Boom.notFound('No records found');
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

          return h.response(results[0]).code(200);

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
          query: eventExportSingleQuery
        },
        response: {
          status: {
            200: eventExportSuccessResponse
          }
        },
        description: 'Export an event merged with its aux_data based on event id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['event_exports','api']
      }
    });
  }
};
