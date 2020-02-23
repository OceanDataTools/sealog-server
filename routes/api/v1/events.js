const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { parseAsync } = require('json2csv');
const Deepcopy = require('deepcopy');

const THRESHOLD = 120; //seconds

const {
  useAccessControl
} = require('../../../config/email_constants');

const {
  eventsTable,
  usersTable,
  eventAuxDataTable,
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

const _flattenJSON = (json) => {

  const flattenJSON = json.map((event) => {
  
    const copiedEvent = Deepcopy(event);

    copiedEvent.event_options.map((data) => {
  
      const elementName = `event_option.${data.event_option_name}`;
      copiedEvent[elementName] = data.event_option_value;
    });

    delete copiedEvent.event_options;

    copiedEvent.ts = copiedEvent.ts.toISOString();
    copiedEvent.id = copiedEvent.id.id.toString('hex');
    copiedEvent.event_free_text = "\"" + copiedEvent.event_free_text.replace(/"/g, '\\"') + "\"";
    return copiedEvent;
  });

  return flattenJSON;
};

const _buildCSVHeaders = (flattenJSON) => {

  const csvHeaders = flattenJSON.reduce((headers, event) => {

    const keyNames = Object.keys(event);

    return headers.concat(keyNames).filter((value, index, self) => {

      return self.indexOf(value) === index;
    });
  }, ['id','ts','event_value','event_author','event_free_text']);

  return csvHeaders.slice(0, 5).concat(csvHeaders.slice(5).sort());
};

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


const authorizationHeader = Joi.object({
  authorization: Joi.string().required()
}).options({ allowUnknown: true }).label('authorizationHeader');

const eventParam = Joi.object({
  id: Joi.string().length(24).required()
}).label('eventParam');

const eventQuery = Joi.object({
  format: Joi.string().optional(),
  offset: Joi.number().integer().min(0).optional(),
  limit: Joi.number().integer().min(1).optional(),
  sort: Joi.string().optional(),
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
}).optional().label('eventQuery');

const eventSuccessResponse = Joi.object({
  id: Joi.object(),
  event_author: Joi.string(),
  ts: Joi.date().iso(),
  event_value: Joi.string(),
  event_options: Joi.array().items(Joi.object({
    event_option_name: Joi.string(),
    event_option_value: Joi.string().allow('')
  })),
  event_free_text: Joi.string().allow('')
}).label('eventSuccessResponse');

const eventCreatePayload = Joi.object({
  id: Joi.string().length(24).optional(),
  event_author: Joi.string().min(1).max(100).optional(),
  ts: Joi.date().iso().optional(),
  event_value: Joi.string().min(1).max(100).required(),
  event_options: Joi.array().items(Joi.object({
    event_option_name:Joi.string().required(),
    event_option_value:Joi.string().allow('').required()
  })).optional(),
  event_free_text: Joi.string().allow('').optional()
}).label('eventCreatePayload');

const eventCreateResponse = Joi.object({
  n: Joi.number().integer(),
  ok: Joi.number().integer(),
  insertedCount: Joi.number().integer(),
  insertedId: Joi.object(),
  insertedEvent: eventSuccessResponse
}).label('eventCreateResponse');

const eventUpdatePayload = Joi.object({
  event_author: Joi.string().min(1).max(100).optional(),
  ts: Joi.date().iso().optional(),
  event_value: Joi.string().min(1).max(100).optional(),
  event_options: Joi.array().items(Joi.object({
    event_option_name:Joi.string().required(),
    event_option_value:Joi.string().allow('').required()
  })).optional(),
  event_free_text: Joi.string().allow('').optional()
}).required().min(1).label('eventUpdateResponse');

exports.plugin = {
  name: 'routes-api-events',
  dependencies: ['hapi-mongodb', 'nes'],
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
            return Boom.notFound('No cruise record found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes("admin") && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = _buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);
        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort( { ts: 1  } ).skip(offset).limit(limit).toArray();
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

          results.forEach(_renameAndClearFields);

          if (request.query.format && request.query.format === "csv") {
            const flattenJSON = _flattenJSON(results);
            const csvHeaders = _buildCSVHeaders(flattenJSON);

            const csv_results = await parseAsync(flattenJSON, { fields: csvHeaders })
              .then((csv) => {
              
                return csv;
              })
              .catch((err) => {
              
                console.error(err);
                throw err;
              });

            // const csv_results = await Converter.json2csvAsync(flattenJSON, json2csvOptions)
            //   .then((csv) => {
              
            //     return csv;
            //   })
            //   .catch((err) => {

            //     console.log(err);
            //     throw err;    
            //   });

            return h.response(csv_results).code(200);
          }

          return h.response(results).code(200);
        }

        return Boom.notFound('No records found' );
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
            200: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(eventSuccessResponse)
            )
          }
        },
        description: 'Export the events for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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
            return Boom.notFound('No record cruise found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes("admin") && cruiseResult.cruise_hidden && (useAccessControl && typeof cruiseResult.cruise_access_list !== 'undefined' && !cruiseResult.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this cruise');
          }

          cruise = cruiseResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        if (cruise.cruise_hidden && !request.auth.credentials.scope.includes("admin")) {
          return Boom.unauthorized('User not authorized to retrieve hidden cruises');
        }

        const query = _buildEventsQuery(request, cruise.start_ts, cruise.stop_ts);

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort( { ts: 1  } ).toArray();
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
            200: Joi.object({
              events: Joi.number().integer()
            })
          }
        },
        description: 'Return the number of events for a cruise based on the cruise id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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
            return Boom.notFound('No record lowering found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes("admin") && loweringResult.lowering_hidden && (useAccessControl && typeof loweringResult.lowering_access_list !== 'undefined' && !loweringResult.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = loweringResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = _buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);
        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort( { ts: 1  } ).skip(offset).limit(limit).toArray();
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

          results.forEach(_renameAndClearFields);

          if (request.query.format && request.query.format === "csv") {

            const flattenJSON = _flattenJSON(results);
            const csvHeaders = _buildCSVHeaders(flattenJSON);
            
            const csv_results = await parseAsync(flattenJSON, { fields: csvHeaders })
              .then((csv) => {

                return csv;
              })
              .catch((err) => {

                console.error(err);
                throw err;
              });

            // const csv_results = await Converter.json2csvAsync(flattenJSON, json2csvOptions)
            //   .then((csv) => {
              
            //     return csv;
            //   })
            //   .catch((err) => {

            //     console.log(err);
            //     throw err;    
            //   });

            return h.response(csv_results).code(200);
          }

          return h.response(results).code(200);
        }

        return Boom.notFound('No records found' );
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
            200: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(eventSuccessResponse)
            )
          }
        },
        description: 'Export the events for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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
            return Boom.notFound('No record lowering found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes("admin") && loweringResult.lowering_hidden && (useAccessControl && typeof loweringResult.lowering_access_list !== 'undefined' && !loweringResult.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to retrieve this lowering');
          }

          lowering = loweringResult;
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const query = _buildEventsQuery(request, lowering.start_ts, lowering.stop_ts);

        let results = [];

        try {
          results = await db.collection(eventsTable).find(query).sort( { ts: 1  } ).toArray();
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
            200: Joi.object({
              events: Joi.number().integer()
            })
          }
        },
        description: 'Export the number of events for a lowering based on the lowering id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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

          const query = _buildEventsQuery(request);
          query._id = datasourceIDs;
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === "newest") ? { ts: -1 } : { ts: 1 };

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

          const query = _buildEventsQuery(request);
          const limit = (request.query.limit) ? request.query.limit : 0;
          const offset = (request.query.offset) ? request.query.offset : 0;
          const sort = (request.query.sort === "newest") ? { ts: -1 } : { ts: 1 };

          try {
            const results = await db.collection(eventsTable).find(query).sort(sort).skip(offset).limit(limit).toArray();
            // console.log("results:", results);

            if (results.length > 0) {

              results.forEach(_renameAndClearFields);

              if (request.query.format && request.query.format === "csv") {
                const flattenJSON = _flattenJSON(results);
                const csvHeaders = _buildCSVHeaders(flattenJSON);

                const csv_results = await parseAsync(flattenJSON, { fields: csvHeaders })
                  .then((csv) => {

                    return csv;
                  })
                  .catch((err) => {

                    console.error(err);
                    throw err;
                  });

                // const csv_results = await Converter.json2csvAsync(flattenJSON, json2csvOptions)
                //   .then((csv) => {
                  
                //     return csv;
                //   })
                //   .catch((err) => {

                //     console.log(err);
                //     throw err;    
                //   });

                return h.response(csv_results).code(200);
              }

              return h.response(results).code(200);
            }

            return Boom.notFound('No records found' );
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
            200: Joi.alternatives().try(
              Joi.string(),
              Joi.array().items(eventSuccessResponse)
            )
          }
        },
        description: 'Return the events based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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

            // console.log("collection:", eventIDs);

            datasourceIDs = { $in: eventIDs };

          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

          const query = _buildEventsQuery(request);
          query._id = datasourceIDs;

          try {
            const results = await db.collection(eventsTable).find(query).toArray();
            // console.log("results:", results);

            return h.response({ "events": results.length }).code(200);
            
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('database error');
          }

        }
        else {

          const query = _buildEventsQuery(request);

          try {
            const results = await db.collection(eventsTable).find(query).toArray();
            // console.log("results:", results);

            return h.response({ "events": results.length }).code(200);
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
            200: Joi.object({
              events: Joi.number().integer()
            })
          }
        },
        description: 'Return the number of events based on query parameters',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth', 'api']
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
          const result = await db.collection(eventsTable).findOne(query);

          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id );
          }

          return h.response(_renameAndClearFields(result)).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth:{
          strategy: 'jwt',
          scope: ['admin', 'read_events']
        },
        validate: {
          headers: authorizationHeader,
          params: eventParam
        },
        response: {
          status: {
            200: eventSuccessResponse
          }
        },
        description: 'Return an event based on the event id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
        tags: ['events','auth','api']
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
            console.log("invalid ObjectID");
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

            event_option.event_option_name = event_option.event_option_name.toLowerCase().replace(/\s+/g, "_");
            return event_option;
          });
        }

        if (!event.event_free_text) {
          event.event_free_text = "";
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

        try {
          const result = await db.collection(eventsTable).insertOne(event);

          event._id = result.insertedId;
          _renameAndClearFields(event);

          const diff = (new Date().getTime() - event.ts.getTime()) / 1000;
          if (Math.abs(Math.round(diff)) < THRESHOLD) {
            server.publish('/ws/status/newEvents', event);
          }

          return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId, insertedEvent: event }).code(201);
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
        tags: ['events','auth','api']
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
          console.log("invalid ObjectID");
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

            event_option.event_option_name = event_option.event_option_name.toLowerCase().replace(/\s+/g, "_");
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
          // const result = await db.collection(eventsTable).findOneAndUpdate(query, { $set: request.payload },{ returnOriginal: false });
          const result = await db.collection(eventsTable).findOneAndUpdate(query, { $set: event },{ returnOriginal: false });

          if (time_change) {
            server.publish('/ws/status/deleteEvents', _renameAndClearFields(result.value));

            // delete any aux_data
            const aux_data_query = { event_id: ObjectID(result.value._id) };
            console.log("query:", aux_data_query);
            const test = await db.collection(eventAuxDataTable).deleteMany(aux_data_query);
            console.log('test:', test);

            // if the event is recent, broadcast on mewEvents WS feed
            const diff = (new Date().getTime() - result.value.ts.getTime()) / 1000;
            console.log('diff:', diff);

            if (Math.abs(Math.round(diff)) < THRESHOLD) {
              console.log("still new event");
              server.publish('/ws/status/newEvents', _renameAndClearFields(result.value));
            }

          }
          else {
            server.publish('/ws/status/updateEvents', _renameAndClearFields(result.value));
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
        tags: ['events','auth','api']
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
          console.log("invalid ObjectID");
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
        tags: ['events','auth','api']
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
          <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
        tags: ['events','auth','api']
      }
    });
  }
};