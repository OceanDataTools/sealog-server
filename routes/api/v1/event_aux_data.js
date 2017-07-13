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
r.db("eventlogger").table("events").merge(function(row){ return {'aux_data': r.db('eventlogger').table('aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a time filter
r.db("eventlogger").table("events").filter(function(event) {return event('ts').during(r.time(2017, 3, 15, 'Z'), r.now())}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a user filter (full name)
r.db("eventlogger").table("events").filter({'user_name': 'Adam Soule'}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data while applying a user filter (partial match)
r.db("eventlogger").table("events").filter(function(event) {return event('user_name').match("Adam")}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

//Merge event and aux_data for all events with framegrabber data
r.db("eventlogger").table("aux_data").filter({'data_source': 'framegrabber'}).map(function(row){ return r.db("eventlogger").table("events").get(row('event_id'))}).merge(function(row){ return {'aux_data': r.db('eventlogger').table('aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')}})

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

  server.route({
    method: 'GET',
    path: '/event_aux_data',
    handler: function (request, reply) {

      let query = db.table('event_aux_data');

      //event_id filtering
      if (request.query.eventID) {

        if(Array.isArray(request.query.eventID)) {

          query = query.filter(((eventIDArray) => {

            let condition;

            eventIDArray.forEach((eventID) => {

              if (typeof condition === 'undefined') {
                condition = r.row('event_id').eq(eventID);
              } else {
                condition = condition.or(r.row('event_id').eq(eventID));
              }
            });
          
            return condition;
          })(request.query.eventID));
        } else {
          query = query.filter({'event_id': request.query.eventID});
        }
      }

      //data_source filtering
      if (request.query.datasource) {

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

      query.run().then((result) =>{

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
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        query: Joi.object({
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
          datasource: Joi.alternatives().try(
            Joi.string(),
            Joi.array().items(Joi.string()).optional()
          ),
          eventID: Joi.alternatives().try(
            Joi.string().uuid(),
            Joi.array().items(Joi.string().uuid()).optional()
          ),
        }).optional()
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.string().uuid(),
            event_id: Joi.string().uuid(),
            data_source: Joi.string(),
            data_array: Joi.array().items(Joi.object({
              data_name: Joi.string(),
              data_value: Joi.string(),
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
      description: 'Return the event_aux_data record based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      let query = db.table('event_aux_data').get(request.params.id);

      query.run().then((result) => {
        if (!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }
        return reply(result).code(200);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth:{
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
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
            event_id: Joi.string().uuid(),
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
      description: 'Return the event_aux_data record based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_aux_data','auth', 'api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/event_aux_data',
    handler: function (request, reply) {

      let event_aux_data = request.payload;

      db.table('events').filter({event_id: event_aux_data.event_id}).run().then((result) => {

        if(!result){
          return reply({statusCode:'400', error: 'invalid event_id', message: 'event not found'}).code(400);
        }
        //console.log(event);
        db.table('event_aux_data').insert(event_aux_data).run().then((result) => {
          return reply(result).code(201);
        }).catch((err) => {
          throw err;
        });
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        payload: {
          event_id: Joi.string().uuid().required(),
          data_source: Joi.string().min(1).max(100).required(),
          data_array: Joi.array().items(Joi.object({
            data_name:Joi.string().required(),
            data_value:Joi.string().required(),
            data_uom:Joi.string().optional()
          })).required().min(1),
        }
      },
      response: {
        status: {
          201: Joi.object({
            deleted: Joi.number().integer(),
            errors: Joi.number().integer(),
            generated_keys: Joi.array().items(Joi.string().uuid()),
            inserted: Joi.number().integer(),
            replaced: Joi.number().integer(),
            skipped: Joi.number().integer(),
            unchanged: Joi.number().integer(),
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
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      let query = db.table('event_aux_data').get(request.params.id);

      query.run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        if(request.payload.data_array) {
          result.data_array.forEach((resultOption) => {
            let foundit = false;
            
            request.payload.data_array.forEach((requestOption) => {
            
              if(requestOption.data_name == resultOption.data_name) {
                requestOption.data_value = resultOption.data_value;
                
                if(resultOption.data_uom) {
                  requestOption.data_uom = resultOption.data_uom;
                }

                foundit = true;
              }
            });

            if (!foundit) {
              request.payload.data_array.push(resultOption);
            }
          });
        }

        db.table("event_aux_data").get(request.params.id).update(request.payload).run().then(() => {
          return reply().code(204);
        }).catch((err) => {
          throw err;
        });

      }).catch((err) => {
        throw err;
      });

    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger', 'api']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        }),
        payload: Joi.object({
          event_id: Joi.string().uuid().optional(),
          data_source: Joi.string().min(1).max(100).optional(),
          data_array: Joi.array().items(Joi.object({
            data_name:Joi.string().required(),
            data_value:Joi.string().required(),
            data_uom:Joi.string().optional(),
          })).optional(),
        }).required().min(1),
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
      tags: ['event_aux_data','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_aux_data/{id}',
    handler: function (request, reply) {

      db.table('event_aux_data').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.table('event_aux_data').get(request.params.id).delete().run().then(() => {

          return reply().code(204);
        
        }).catch((err) => {
          throw err;
        });

      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
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
      tags: [ 'event_aux_data','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_aux_data',
  dependencies: ['db']
};