'use strict';
const SECRET_KEY = require('../config/secret');

//const Boom = require('boom');
const Bcrypt = require('bcryptjs');
const Joi = require('joi');
const Jwt = require('jsonwebtoken');

const saltRounds = 10;

exports.register = function (server, options, next) {

  const db = server.app.db;

  // Need to add a register route
  server.route({
    method: 'POST',
    path: '/register',
    handler: function (request, reply) {

      db.table('users').filter({
        username: request.payload.username
      }).run().then((users) => {

        if (users.length) {
          return reply({message: 'username already exists'}).code(422);
        }

        let user = request.payload;

        user.last_login = new Date().toISOString();
        user.roles = ['event_logger', 'event_watcher'];
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
      validate: {
        payload: {
          username: Joi.string().min(1).max(50).required(),
          fullname: Joi.string().min(1).max(50).required(),
          email: Joi.string().min(1).max(50).required(),
          password: Joi.string().allow('').max(50).required()
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
          422: Joi.object({
            statusCode: Joi.number().integer(),
            message: Joi.string()
          }),
        }
      },
      description: 'This is the route used for registering new users.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - registration successful</div>\
        <div class="panel-body">Returns JSON object conatining username and JWT token</div>\
      </div>\
      <div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 400</strong> - bad request</div>\
        <div class="panel-body">Returns JSON object explaining error</div>\
      </div>\
      <div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 422</strong> - user already exists</div>\
        <div class="panel-body">Returns JSON object explaining error</div>\
      </div>',
      tags: ['register', 'auth']
    }
  });

  server.route({
    method: 'POST',
    path: '/login',
    handler: function (request, reply) {

      db.table('users').filter({
        username: request.payload.username
      }).run().then((users) => {

        if (!users.length) {
          return reply().code(401);
        }

        let user = users[0];
        
        Bcrypt.compare(request.payload.password, user.password, (err, res) => {

          if (err) {
            throw err;
          }

          if (!res) {
            return reply().code(401);
          }

          user.last_login = new Date().toISOString();

          db.table('users').get(user.id).update(user).run().then((result) => {

            return result;
          });

          return reply({
            token: Jwt.sign({id:user.id, scope: user.roles}, SECRET_KEY),
            id: user.id
          });
        });
      }).catch((err) => {
        throw err;
      });
    },
    config: {
      validate: {
        payload: {
          username: Joi.string().min(1).max(50).required(),
          password: Joi.string().allow('').max(50).required()
        }
      },
      response: {
        status: {
          200: Joi.object({
            token: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/),
            id: Joi.string().uuid()
          }),
        }
      },
      description: 'This is the route used for authenication via user/pass.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - authenication successful</div>\
        <div class="panel-body">Returns JSON object conatining user information</div>\
      </div>\
      <div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
        <div class="panel-body">Returns nothing</div>\
      </div>',
      tags: ['login', 'auth']
    }
  });

  server.route({
    method: 'GET',
    path: '/validate',
    handler: function (request, reply) {
      return reply({status:"valid"}).code(200);
    },
    config: {
      auth: {
        strategy: 'jwt',
      },
      description: 'This is the route used for verifying the JWT is current.',
      notes: '<div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 200</strong> - authenication successful</div>\
        <div class="panel-body">Returns nothing</div>\
      </div>\
      <div class="panel panel-default">\
        <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
        <div class="panel-body">Returns nothing</div>\
      </div>',
      tags: ['login', 'auth']
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-auth',
  dependencies: ['db']
};
