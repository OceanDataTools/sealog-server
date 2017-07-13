/* GET /users -> Get all users */
/*     Handle filtering in the URL i.e. ?offset=20&limit=10 */
/* GET /users/{id} -> Get a single user */
/* POST /users -> Submit a new user */
/* PATCH /users/id} -> Update Single user */
/* DELETE /users/{id} -> Delete Single user */

//roles
// manage users
// | manage event definitions
// | | event logger
// | | | event watcher
// | | | |
// 1 1 1 1 = 15 => admin
// 0 1 1 1 = 7  => event_manager
// 0 0 1 1 = 3  => event_logger
// 0 0 0 1 = 1  => event_watcher


'use strict';
const Bcrypt = require('bcryptjs');
const Joi = require('joi');

const saltRounds = 10;

exports.register = function (server, options, next) {

  const db = server.app.db;
  const r = server.app.r;

  const _renameAndClearFields = (doc) => {

    //remove fields entirely
    delete doc.favorites;
    delete doc.password;
  };

  server.route({
    method: 'GET',
    path: '/users',
    handler: function (request, reply) {

      let query = db.table('users');

      if (request.query.sort === 'username') {
        query = query.orderBy(r.asc('username'));
      } else { // last_login
        query = query.orderBy(r.desc('last_login'));
      }

      if (request.query.offset) {
        query = query.skip(request.query.offset);
      } 

      if (request.query.limit) {
        query = query.limit(request.query.limit);
      } 

      query.run().then((results) =>{
        results.forEach(_renameAndClearFields);
        return reply(results);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: 'admin'
      },
      validate: {
        query: Joi.object({
          offset: Joi.number().integer().min(0).optional(),
          limit: Joi.number().integer().min(1).optional(),
          sort: Joi.string().valid('username', 'last_login').default('username').optional()
        })
      },
      response: {
        status: {
          200: Joi.array().items(Joi.object({
            id: Joi.string().uuid(),
            email: Joi.string().email(),
            last_login: Joi.string().allow('').isoDate(),
            fullname: Joi.string(),
            username: Joi.string(),
            roles: Joi.array().items(Joi.string()),
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
      description: 'Return the current list of users',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['users','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/users/{id}',
    handler: function (request, reply) {

      //TODO - add code so that only admins and the user can do this.

      db.table('users').get(request.params.id).run().then((results) => {
        if (!results) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        _renameAndClearFields(results);

        return reply(results).code(200);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth:{
        strategy: 'jwt',
//        scope: ''
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
            email: Joi.string().email(),
            last_login: Joi.string().allow('').isoDate(),
            fullname: Joi.string(),
            username: Joi.string(),
            roles: Joi.array().items(Joi.string()),
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
      description: 'Return a single user based on user\'s id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  server.route({
    method: 'GET',
    path: '/users/{id}/favorites',
    handler: function (request, reply) {

      //TODO - add code so that only admins and the user can do this.

      db.table('users').get(request.params.id).pluck('id','favorites').run().then((results) => {
        if (!results) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        return reply(results).code(200);
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
//        scope: ''
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
            favorites: Joi.array().items(Joi.string().uuid())
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
      description: 'Return the favorites for a single user based on user\'s id',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  server.route({
    method: 'POST',
    path: '/users',
    handler: function (request, reply) {

      //check if username already exists
      db.table('users').filter({
        username: request.payload.username
      }).run().then((userList) => {

        if (userList.length) {
          return reply({ "statusCode": 422, 'message': 'Username already exists' }).code(422);
        }

        let user = request.payload;

        user.last_login = '';
        user.favorites = [];

        let password = request.payload.password;

        Bcrypt.genSalt(saltRounds, function(err, salt) {
          Bcrypt.hash(password, salt, function(err, hash) {
        
            user.password = hash;

            db.table('users').insert(user).run().then((result) => {
              return reply(result).code(201);
            }).catch((err) => {
              throw err;
            });
          });
        });

      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: 'admin'
      },
      // cors: {
      //   origin: ['*'],
      //   additionalHeaders: ['cache-control', 'x-requested-with']
      // },
      validate: {
        payload: {
          username: Joi.string().min(1).max(100).required(),
          fullname: Joi.string().min(1).max(100).required(),
          email: Joi.string().email().required(),
          password: Joi.string().allow('').max(50).required(),
          roles: Joi.array().items(Joi.string()).min(1).required()
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
          401: Joi.object({
            statusCode: Joi.number().integer(),
            error: Joi.string(),
            message: Joi.string()
          }),
          422: Joi.object({
            statusCode: Joi.number().integer(),
            message: Joi.string()
          }),
        }
      },
      description: 'Create a new user',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/users/{id}',
    handler: function (request, reply) {

      //TODO - add code so that only admins and the user can do this.

      db.table('users').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        if (request.payload.username) {
          //check if username already exists for a different account
          db.table('users').filter(
            r.row('username').eq(request.payload.username).and(r.row('id').ne(request.params.id))
          ).run().then((userList) => {

            if (userList.length) {
              return reply({ "statusCode": 422, 'message': 'Username already exists' }).code(422);
            }

            let user = request.payload;

            if(request.payload.password) {
              let password = request.payload.password;

              Bcrypt.genSalt(saltRounds, function(err, salt) {
                Bcrypt.hash(password, salt, function(err, hash) {
                  user.password = hash;

                  //console.log(user);
                  db.table("users").get(request.params.id).update(user).run().then(() => {
                    return reply().code(204);
                  }).catch((err) => {
                    throw err;
                  });

                });
              });
            } else {
              db.table("users").get(request.params.id).update(user).run().then(() => {
                return reply().code(204);
              }).catch((err) => {
                throw err;
              });
            }
          }).catch((err) => {
            throw err;
          });
        } else {

          let user = request.payload;

          if(request.payload.password) {
            let password = request.payload.password;

            Bcrypt.genSalt(saltRounds, function(err, salt) {
              Bcrypt.hash(password, salt, function(err, hash) {
                user.password = hash;

                //console.log(user);
                db.table("users").get(request.params.id).update(user).run().then(() => {
                  return reply().code(204);
                }).catch((err) => {
                  throw err;
                });

              });
            });
          } else {
            db.table("users").get(request.params.id).update(user).run().then(() => {
              return reply().code(204);
            }).catch((err) => {
              throw err;
            });
          }
        }  
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      auth: {
        strategy: 'jwt',
        scope: 'admin'
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        }),
        payload: Joi.object({
          username: Joi.string().min(1).max(100).optional(),
          fullname: Joi.string().min(1).max(100).optional(),
          email: Joi.string().email().optional(),
          password: Joi.string().allow('').max(50).optional(),
          roles: Joi.array().items(Joi.string()).min(1).optional(),
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
          }),
        }
      },
      description: 'Update a user record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  server.route({
    method: 'PATCH',
    path: '/users/{id}/favorites',
    handler: function (request, reply) {

      //TODO - add code so that only admins and the user can do this.

      db.table('users').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 400, "error": "Bad request", 'message': 'No record found for id: ' + request.params.id }).code(400);
        }

        db.table("users").get(request.params.id).update(request.payload).run().then(() => {
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
//        scope: ''
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        }),
        payload: Joi.object({
          favorites: Joi.array().items(Joi.string().uuid())
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
      description: 'Update a user\'s favorites record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  server.route({
    method: 'DELETE',
    path: '/users/{id}',
    handler: function (request, reply) {

      //Can't delete yourself
      if (request.params.id === request.auth.credentials.id) {
        return reply({ "statusCode": 400, "error": "Bad request", 'message': 'Cannot delete yourself' }).code(400);
      }

      db.table('users').get(request.params.id).run().then((result) => {
        if(!result) {
          return reply({ "statusCode": 404, 'message': 'No record found for id: ' + request.params.id }).code(404);
        }

        db.table('users').get(request.params.id).delete().run().then(() => {
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
        scope: 'admin'
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required()
        })
      },
      description: 'Delete a user record',
      notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
        <p>Available to: <strong>admin</strong></p>',
      tags: ['user','auth','api'],
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-api-users',
  dependencies: ['db']
};
