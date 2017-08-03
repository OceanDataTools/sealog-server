/* SCHEMA
{
	"id": "uuid",
	"ts": "timestamp",
	"author": "author",
  "event_name": "Fish"
  "event_options": [{
    "event_option_name": "status",
    "event_option_value": "alive"
  },
  {
    "event_option_name": "location",
    "event_data_value": "mid-water"
  }],
  "event_free_text": "this is some free text",
	"aux_data": [{
		"data_source": "metagrabber",
		"data_value": [{
			"meta_name": "meta_name",
			"meta_value": "meta_value"
		}]
	}, {
		"data_source": "framegrabber",
		"data_value": [{
			"camera": "camera_name",
			"filename": "filename"
		}]
	}, {
		"data_source": "datagrabber",
		"data_value": [{
			"data_name": "data_name",
			"data_value": "data_value",
			"data_uom": "data_uom"
		}]
	}, {
		"data_source": "renav",
		"data_value": [{
			"data_name": "data_name",
			"data_value": "data_value",
			"data_uom": "data_uom"
		}]
	}]
}

Event Record
{
	"id": "uuid",
	"user_name": "user_name",
	"ts": "timestamp",
  "event_value": "string"
  "event_options": [{
    "event_option_name": "option_name",
    "event_option_value": "option_value"
  }],
  "event_free_text": "string",
} 

Aux Data
{
	"id": "uuid",
	"event_id": "event_id",
	"data_source": "data_source",
	"data_array": [{
		"data_name": "data_name",
		"data_value": "data_value"
	}]

//Merge event and aux_data
r.db("eventlogger").table("events").merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a time filter
r.db("eventlogger").table("events").filter(function(event) {return event('ts').during(r.time(2017, 3, 15, 'Z'), r.now())}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a user filter (full name)
r.db("eventlogger").table("events").filter({'user_name': 'Adam Soule'}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a user filter (partial match)
r.db("eventlogger").table("events").filter(function(event) {return event('user_name').match("Adam")}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data for all events with framegrabber data
r.db("eventlogger").table("aux_data").filter({'data_source': 'framegrabber'}).map(function(row){ return r.db("eventlogger").table("events").get(row('event_id'))}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Return the types of data_sources as an array
r.db("eventlogger").table("aux_data").pluck('data_source').distinct().map(function(row){ return row('data_source')})

*/

/* GET /events -> Get all events (should set a default limit) */
/*     Handle filtering limit/offset in the URL i.e. ?offset=20&limit=10 */
/*     Handle filtering by time in the URL i.e. ?startTS=startEpoch&stopTS=stopEpoch */
/*     Handle filtering user in the URL i.e. ?user=id&user=id */
/*     Handle filtering by datasource i.e. "?datasource=framegrabber&datasource=eventlogger"
/*     Handle filtering by datasource and key->value i.e. "?datasource[i]=eventlogger&key[i][j]=key&value[i][j]=value"

/* GET /events/{id} -> Get a single event */
/* POST /events -> Submit a new Event */
/* PATCH /events/{id} -> Update Single Event */
/* DELETE /events/{id} -> Delete Single Event */

'use strict';

//const uuid = require('uuid');
const Joi = require('joi');
//const Boom = require('boom');

exports.register = function (server, options, next) {

  const db = server.app.db;
  const r = server.app.r;

//   const _buildEvents = (events) => {
// //    console.log(event);
//       events.merge(function(row){ return {'aux_data': r.db('eventlogger').table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})
//       return events;
//     }).catch((err) => {
//       throw err;
//     });
//   };

  server.route({
    method: 'GET',
    path: '/event_exports',
    handler: function (request, reply) {

      let query;

      //console.log(request.query);

      //Data source filtering
      if (request.query.datasource) {
        query = db.table('event_aux_data');

        if(Array.isArray(request.query.datasource)) {

          query = query.filter(((datasourceArray) => {

            let condition;

            datasourceArray.forEach((datasource) => {

              if (typeof condition === 'undefined') {
                condition = r.row('data_source').eq(datasource);
              } else {
                condition = condition.or(r.row('data_source').eq(datasource));
              }
            });
          
            return condition;
          })(request.query.datasource));
        } else {
          query = query.filter({'data_source': request.query.datasource});
        }

        query = query.map((row) => {
          return db.table("events").get(row('event_id'));
        });
      }

      if (typeof query === 'undefined') {
        query = db.table('events');
      }

      //Time filtering
      if ((request.query.startTS) || (request.query.stopTS)) {
        let startTS = r.time(1970, 1, 1, 'Z');
        let stopTS = r.now();
        
        if (request.query.startTS) {
          startTS = request.query.startTS;
        }

        if (request.query.stopTS) {
          stopTS = request.query.stopTS;
        }

        query = query.filter((event) => {
          return event('ts').during(startTS, stopTS, {rightBound:'closed'});
        });
      }

      //User filtering
      if (request.query.user) {

        if(Array.isArray(request.query.user)) {

          query = query.filter(((userArray) => {

            let condition;

            userArray.forEach((user) => {

              if (typeof condition === 'undefined') {
                condition = r.row('user_name').eq(user);
              } else {
                condition = condition.or(r.row('user_name').eq(user));
              }
            });
          
            return condition;
          })(request.query.user));
        } else {
          query = query.filter({'user_name': request.query.user});
        }
      }

      //value filtering
      if (request.query.value) {

        if(Array.isArray(request.query.value)) {

          query = query.filter(((valueArray) => {

            let condition;

            valueArray.forEach((value) => {

              if (typeof condition === 'undefined') {
                condition = r.row('event_value').eq(value);
              } else {
                condition = condition.or(r.row('event_value').eq(value));
              }
            });
          
            return condition;
          })(request.query.value));
        } else {
          query = query.filter({'event_value': request.query.value});
        }
      }

      //freetext filtering
      if (request.query.freetext) {

        if(Array.isArray(request.query.freetext)) {

          query = query.filter(((freetextArray) => {

            let condition;

            freetextArray.forEach((freetext) => {

              if (typeof condition === 'undefined') {
                condition = r.row('event_free_text').match(freetext);
              } else {
                condition = condition.or(r.row('event_free_text').match(freetext));
              }
            });
          
            return condition;
          })(request.query.freetext));
        } else {
          query = query.filter((event) => {
            return event('event_free_text').match(request.query.freetext);
          });
        }
      }

      //Offset filtering
      if (request.query.offset) {
        query = query.skip(request.query.offset);
      } 

      //Limit filtering
      if (request.query.limit) {
        query = query.limit(request.query.limit);
      } 

      //console.log(query.toString());

      query = query.merge((row) => {
        return {'aux_data': db.table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')};
      });

      return query.run().then((result) =>{

        if (result.length > 0) {
          return reply(result).code(200);
        } else {
          return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
        }
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
      },
      validate: {
        query: Joi.object({
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
          user: Joi.alternatives().try(
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
          ),
        }).optional()
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.string().uuid(),
            user_name: Joi.string(),
            ts: Joi.date().iso(),
            event_value: Joi.string(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_value: Joi.string()
            })),
            event_free_text: Joi.string(),
            aux_data: Joi.array().items(Joi.object({
              id: Joi.string().uuid(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.string(),
                data_uom: Joi.string()
              }))
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
      description: 'Return the event exports based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
      tags: ['events','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_exports/{id}',
    handler: function (request, reply) {

      let query = db.table('events').get(request.params.id);

      return query.run().then((result) => {
        if (!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        query = query.merge((row) => {
          return {'aux_data': db.table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')};
        });

        return query.run().then((result) => {
          return reply(result).code(200);
        }).catch((err) => {
          throw err;
        });
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth:{
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger', 'event_watcher']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        })
      },
      response: {
        status: {
          200: Joi.object({
            id: Joi.string().uuid(),
            user_name: Joi.string(),
            ts: Joi.date().iso(),
            event_value: Joi.string(),
            event_options: Joi.array().items(Joi.object({
              event_option_name: Joi.string(),
              event_option_value: Joi.string()
            })),
            event_free_text: Joi.string(),
            aux_data: Joi.array().items(Joi.object({
              id: Joi.string().uuid(),
              data_source: Joi.string(),
              data_array: Joi.array().items(Joi.object({
                data_name: Joi.string(),
                data_value: Joi.string(),
                data_uom: Joi.string()
              }))
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
      description: 'Return the event exports based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong>, <strong>event_logger</strong> or <strong>event_watcher</strong></p>',
      tags: ['events','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event-exports',
  dependencies: ['db']
};
