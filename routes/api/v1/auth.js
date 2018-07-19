'use strict';
const SECRET_KEY = require('../../../config/secret');

//const Boom = require('boom');
const Bcrypt = require('bcryptjs');
const Joi = require('joi');
const Jwt = require('jsonwebtoken');

const {
  usersTable,
} = require('../../../config/db_constants');

const saltRounds = 10;

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  // Need to add a register route
  server.route({
    method: 'POST',
    path: '/register',
    handler: function (request, reply) {
    
      db.collection(usersTable).findOne({ username: request.payload.username }, (err, result) => {

        if (err) {
          console.log("ERROR:", err);
          return reply().code(503);
        }

        if (result) {
          return reply({message: 'username already exists'}).code(422);
        }

        let user = request.payload;

        user.last_login = new Date().toISOString();
        user.roles = ['event_logger', 'event_watcher', 'event_manager'];
        user.system_user = false;

        let password = request.payload.password;

        Bcrypt.genSalt(saltRounds, (err, salt) => {
          Bcrypt.hash(password, salt, (err, hash) => {

            user.password = hash;

            db.collection(usersTable).insertOne(user, (err, result) => {

              if (err) {
                console.log("ERROR:", err);
                return reply().code(503);
              }

              if (!result) {
                return reply({ "statusCode": 400, 'message': 'Bad request'}).code(400);
              }

              return reply({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);
            });
          });
        });
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
      tags: ['register', 'auth', 'api']
    }
  });

  server.route({
    method: 'POST',
    path: '/login',
    handler: function (request, reply) {

      db.collection(usersTable).findOne({ username: request.payload.username }, (err, result) => {

        if (err) {
          console.log("ERROR:", err);
          return reply().code(503);
        }

        if (!result) {
          return reply().code(401);
        }

        let user = result;
        
        //console.log("Password:", user.password)
        Bcrypt.compare(request.payload.password, user.password, (err, result) => {

          if (err) {
            console.log("ERROR:", err);
            return reply().code(503);
          }

          if (!result) {
            return reply().code(401);
          }

          user.last_login = new Date();

          db.collection(usersTable).update( { _id: new ObjectID(user._id) }, {$set: user}, (err, result) => {

            if (err) {
              console.log("ERROR:", err);
              return reply().code(503);
            }

            if (!result) {
              console.log("ERROR:", err);
              return reply().code(503);
            }

            return reply({ token: Jwt.sign( { id:user._id, scope: user.roles}, SECRET_KEY), id: user._id.toString() }).code(200);
          });
        });
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
            id: Joi.string()
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
      tags: ['login', 'auth', 'api']
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
      validate: {
        headers: {
          authorization: Joi.string().required()
        },
        options: {
          allowUnknown: true
        }
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
      tags: ['login', 'auth', 'api']
    }
  });

  return next();
};

exports.register.attributes = {
  name: 'routes-auth',
  dependencies: ['hapi-mongodb']
};
