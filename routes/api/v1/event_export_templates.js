// Event Record
// {
//  "id": "uuid",
//  "user_name": "user_name",
//  "ts": "timestamp",
//   "event_value": "string"
//   "event_options": [{
//     "event_option_name": "option_name",
//     "event_option_value": "option_value"
//   }],
//   "event_free_text": "string",
// }

// Event Templates Record
// {
//   id: uuid, // id of the event template
//   event_template_name: string, // name of the event template
//   event_templates: [
//     event_template_id (uuid),
//     ...
//   ]
// }

'use strict';

//const uuid = require('uuid');
const Joi = require('joi');
//const Boom = require('boom');

exports.register = function (server, options, next) {

  const db = server.app.db;
  const r = server.app.r;

  server.route({
    method: 'GET',
    path: '/event_export_templates',
    handler: function (request, reply) {

      let query = db.table('event_export_templates');

      //console.log(request.query);

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
        }).optional()
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.string().uuid(),
            event_export_template_name: Joi.string(),
            event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
            event_export_template_offset: Joi.number().integer().min(0),
            event_export_template_limit: Joi.number().integer().min(0),
            event_export_template_startTS: Joi.date().iso().allow(''),
            event_export_template_stopTS: Joi.date().iso().allow(''),
            event_export_template_user_filter: Joi.array().items(Joi.string()),
            event_export_template_datasource_filter: Joi.array().items(Joi.string()),
            event_export_template_freetext_filter: Joi.string().allow(''),
            event_export_template_include_aux_data: Joi.bool()
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
      description: 'Return the event export templates based on query parameters',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      let query = db.table('event_export_templates').get(request.params.id);

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
            event_export_template_name: Joi.string(),
            event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
            event_export_template_offset: Joi.number().integer().min(0),
            event_export_template_limit: Joi.number().integer().min(0),
            event_export_template_startTS: Joi.date().iso().allow(''),
            event_export_template_stopTS: Joi.date().iso().allow(''),
            event_export_template_user_filter: Joi.array().items(Joi.string()),
            event_export_template_datasource_filter: Joi.array().items(Joi.string()),
            event_export_template_freetext_filter: Joi.string().allow(''),
            event_export_template_include_aux_data: Joi.bool()
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
      description: 'Return the event export templates based on event id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/event_export_templates/{id}/run',
    handler: function (request, reply) {

      let query = db.table('event_export_templates').get(request.params.id);

      query.run().then((result) => {
        if (!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        query = undefined;

        //Data source filtering
        if (result.event_export_template_datasource_filter) {

          if(Array.isArray(result.event_export_template_datasource_filter) && result.event_export_template_datasource_filter.length > 0) {

            query = db.table('event_aux_data');
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
            })(result.event_export_template_datasource_filter));
          } else if (!Array.isArray(result.event_export_template_datasource_filter)) {
            query = db.table('event_aux_data');
            query = query.filter({'data_source': result.event_export_template_datasource_filter});
          }

          if (typeof query !== 'undefined') {
            query = query.map((row) => {
              return db.table("events").get(row('event_id'));
            });
          }
        }

        if (typeof query === 'undefined') {
          query = db.table('events');
        }

        //Time filtering
        if ((result.event_export_template_startTS) || (result.event_export_template_stopTS)) {
          let startTS = r.time(1970, 1, 1, 'Z');
          let stopTS = r.now();
          
          if (result.event_export_template_startTS) {
            startTS = result.event_export_template_startTS;
          }

          if (result.event_export_template_stopTS) {
            stopTS = result.event_export_template_stopTS;
          }

          query = query.filter((event) => {
            return event('ts').during(startTS, stopTS);
          });
        }

        //User filtering
        if (result.event_export_template_user_filter) {

          if(Array.isArray(result.event_export_template_user_filter) && result.event_export_template_user_filter.length > 0) {

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
            })(result.event_export_template_user_filter));
          } else if (!Array.isArray(result.event_export_template_user_filter)){
            query = query.filter({'user_name': result.event_export_template_user_filter});
          }
        }

        //value filtering
        if (result.event_export_template_eventvalue_filter) {

          if(Array.isArray(result.event_export_template_eventvalue_filter) && result.event_export_template_eventvalue_filter.length > 0) {

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
            })(result.event_export_template_eventvalue_filter));
          } else if (!Array.isArray(result.event_export_template_eventvalue_filter)) {
            query = query.filter({'event_value': result.event_export_template_eventvalue_filter});
          }
        }

        //freetext filtering
        if (result.event_export_template_freetext_filter) {

          if(Array.isArray(result.event_export_template_freetext_filter) && result.event_export_template_freetext_filter.length > 0) {

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
            })(result.event_export_template_freetext_filter));
          } else {
            query = query.filter((event) => {
              return event('event_free_text').match(result.event_export_template_freetext_filter);
            });
          }
        }

        //Offset filtering
        if (result.event_export_template_offset) {
          query = query.skip(result.event_export_template_offset);
        } 

        //Limit filtering
        if (result.event_export_template_limit) {
          query = query.limit(result.event_export_template_limit);
        } 

        if (result.event_export_template_include_aux_data) {
          query = query.merge((row) => {
            return {'aux_data': db.table('event_aux_data').filter({'event_id': row('id')}).without('event_id').coerceTo('array')};
          });
        }

        //console.log(query.toString());

        return query.run().then((result) =>{

          if (result.length > 0) {
            return reply(result).code(200);
          } else {
            return reply({ "statusCode": 404, 'message': 'No records found'}).code(404);
          }
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
        scope: ['admin', 'event_manager', 'event_logger']
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        })
      },
      response: {
        status: {
          //200: Joi.object({
          //  id: Joi.string().uuid(),
          //  event_export_template_name: Joi.string(),
          //  event_export_definitions: Joi.array().items(Joi.string()),
          //}),
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
      description: 'Run the event export templates based on event export template id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });


  server.route({
    method: 'POST',
    path: '/event_export_templates',
    handler: function (request, reply) {

      let event_template = request.payload;

      //console.log(event);

      db.table('event_export_templates').insert(event_template).run().then((result) => {
        return reply(result).code(201);
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
        payload: Joi.object({
          id: Joi.string().uuid(),
          event_export_template_name: Joi.string(),
          event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
          event_export_template_offset: Joi.number().integer().min(0),
          event_export_template_limit: Joi.number().integer().min(0),
          event_export_template_startTS: Joi.date().iso().allow(''),
          event_export_template_stopTS: Joi.date().iso().allow(''),
          event_export_template_user_filter: Joi.array().items(Joi.string()),
          event_export_template_datasource_filter: Joi.array().items(Joi.string()),
          event_export_template_freetext_filter: Joi.string().allow(''),
          event_export_template_include_aux_data: Joi.bool()
        })
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

      description: 'Create a new event export template',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      db.table('event_export_templates').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        let event_template = request.payload;

        db.table("event_export_templates").get(request.params.id).update(event_template).run().then(() => {
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
        }),
        payload: Joi.object({
          id: Joi.string().uuid(),
          event_export_template_name: Joi.string(),
          event_export_template_eventvalue_filter: Joi.array().items(Joi.string()),
          event_export_template_offset: Joi.number().integer().min(0),
          event_export_template_limit: Joi.number().integer().min(0),
          event_export_template_startTS: Joi.date().iso().allow(''),
          event_export_template_stopTS: Joi.date().iso().allow(''),
          event_export_template_user_filter: Joi.array().items(Joi.string()),
          event_export_template_datasource_filter: Joi.array().items(Joi.string()),
          event_export_template_freetext_filter: Joi.string().allow(''),
          event_export_template_include_aux_data: Joi.bool()
        }).required().min(1)
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
      description: 'Update a event export template record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: ['event_templates','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/event_export_templates/{id}',
    handler: function (request, reply) {

      db.table('event_export_templates').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.table('event_export_templates').get(request.params.id).delete().run().then(() => {

          db.table('event_aux_data').filter({'event_id': request.params.id}).delete().run().then(() => {
      
            return reply().code(204);
      
          }).catch((err) => {
            throw err;
          });
        
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
          })
        }
      },
      description: 'Delete an event export template record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong>, <strong>event_manager</strong> or <strong>event_logger</strong></p>',
      tags: [ 'event_templates','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-event_export_template',
  dependencies: ['db']
};
