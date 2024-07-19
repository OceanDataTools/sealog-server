const { randomAsciiString } = require('../../../lib/utils');

const Bcrypt = require('bcryptjs');
const Boom = require('@hapi/boom');
const Crypto = require('crypto');

const saltRounds = 10;

const resetPasswordTokenExpires = 24; //hours

const {
  useAccessControl
} = require('../../../config/server_settings');

const {
  cruisesTable,
  loweringsTable,
  usersTable
} = require('../../../config/db_constants');

const {
  senderAddress,
  emailTransporter
} = require('../../../config/email_settings');

const {
  authorizationHeader,
  databaseInsertResponse,
  loginToken,
  userQuery,
  userSuccessResponse,
  userParam,
  userCreatePayload,
  userUpdatePayload,
  userToken
} = require('../../../lib/validations');

const SECRET_KEY = require('../../../config/secret');
const Jwt = require('jsonwebtoken');

exports.plugin = {
  name: 'routes-api-users',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const _renameAndClearFields = (doc) => {

      //rename id
      doc.id = doc._id;
      delete doc._id;

      //remove fields entirely
      delete doc.password;
      delete doc.resetPasswordToken;
      delete doc.resetPasswordExpires;
      delete doc.loginToken;

      return doc;
    };

    server.route({
      method: 'GET',
      path: '/users',
      async handler(request, h) {

        const query = {};

        if (!request.auth.credentials.roles.includes('admin')) {
          query.system_user = false;
        }
        else if (typeof request.query.system_user !== 'undefined') {
          query.system_user = request.query.system_user;
        }

        const limit = (request.query.limit) ? request.query.limit : 0;
        const offset = (request.query.offset) ? request.query.offset : 0;
        const sort = (request.query.sort) ? { [request.query.sort]: 1 } : { username: 1 };

        try {
          const result = await db.collection(usersTable).find(query).skip(offset).limit(limit).sort(sort).toArray();

          result.forEach(_renameAndClearFields);

          return h.response(result);
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_users']
        },
        validate: {
          headers: authorizationHeader,
          query: userQuery
        },
        response: {
          status: {
            200: userSuccessResponse
          }
        },
        description: 'Return the current list of users',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['users','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/users/{id}',
      async handler(request, h) {

        //if the request is for a user but the requestor is not an admin AND not the requested user, return 400
        // if (!request.auth.credentials.roles.includes('admin') && !request.auth.credentials.scope.includes('read_users') && request.auth.credentials.id !== request.params.id ) {
        //   return Boom.unauthorized('The requesting user is unauthorized to make that request');
        // }

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          // console.log('invalid ObjectID');
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(usersTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for id: ' + request.params.id);
          }
          else if (!request.auth.credentials.roles.includes('admin') && result.system_user && request.auth.credentials.id !== request.params.id) {
            return Boom.badRequest('The requesting user is unauthorized to make that request');
          }

          const cleanedResult = _renameAndClearFields(result);
          return h.response(cleanedResult);

        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'read_users']
        },
        validate: {
          headers: authorizationHeader,
          params: userParam
        },
        response: {
          status: {
            200: userSuccessResponse
          }
        },
        description: 'Return a user record based on the user id',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['users','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/users',
      async handler(request, h) {

        // if (!request.auth.credentials.roles.includes('admin')) {
        //   return h.response({ statusCode: 400, error: "Unauthorized", message: "The requesting user is unauthorized to make that request" }).code(400);
        // }

        if (request.payload.system_user && typeof request.payload.system_user === 'boolean' && !request.auth.credentials.roles.includes('admin')) {
          return Boom.unauthorized('Only admins can create system users');
        }

        const query = { username: request.payload.username };

        try {
          const result = await db.collection(usersTable).findOne(query);
          if (result) {
            return Boom.conflict('Username already exists');
          }
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }

        const resetURL = request.payload.resetURL;
        const user = request.payload;
        delete user.resetURL;

        if (request.payload.id) {
          try {
            user._id = new ObjectID(request.payload.id);
            delete user.id;
          }
          catch (err) {
            // console.log('invalid ObjectID');
            return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
          }
        }

        if (request.payload.system_user && typeof request.payload.system_user === 'boolean') {
          user.system_user = request.payload.system_user;
        }
        else {
          user.system_user = false;
        }

        if (request.payload.disabled && typeof request.payload.disabled === 'boolean') {
          user.disabled = request.payload.disabled;
        }
        else {
          user.disabled = false;
        }

        user.last_login = new Date('1970-01-01T00:00:00.000Z');

        const password = request.payload.password;

        const hashedPassword = await new Promise((resolve, reject) => {

          Bcrypt.hash(password, saltRounds, (err, hash) => {

            if (err) {
              reject(err);
            }

            resolve(hash);
          });
        });

        user.password = hashedPassword;
        user.loginToken = randomAsciiString(20);

        let result = null;

        try {
          result = await db.collection(usersTable).insertOne(user);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

        const token = Crypto.randomBytes(20).toString('hex');

        try {
          await db.collection(usersTable).updateOne({ _id: user._id }, { $set: { resetPasswordToken: token, resetPasswordExpires: Date.now() + (resetPasswordTokenExpires * 60 * 60 * 1000) } }); // token expires in 24 hours
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }

        if (emailTransporter !== null) {
          const resetLink = `${resetURL}${token}`;
          const mailOptions = {
            from: senderAddress,
            to: request.payload.email,
            subject: 'Sealog - New User Created',
            html: `<p>A new Sealog user account was created and associated with this email address.  The username for this account is: ${user.username}</p>
            <p>To set the password for this account please click on the link below.  This link will expire in ${resetPasswordTokenExpires.toString()} hours.</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>Please send any Sealog-related questions to: ${senderAddress}</p>
            <p>Thanks!</p>`
          };

          emailTransporter.sendMail(mailOptions, (err) => {

            if (err) {
              console.log('ERROR:', err);
            }
          });
        }

        return h.response(result).code(201);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_users']
        },
        validate: {
          headers: authorizationHeader,
          payload: userCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: databaseInsertResponse
          }
        },
        description: 'Create a new user',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['users','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/users/{id}',
      async handler(request, h) {

        //TODO - add code so that only admins and the user can do this.
        if (!(request.auth.credentials.id === request.params.id || request.auth.credentials.roles.includes('admin'))) {
          return Boom.badRequest('Only admins and the owner can edit users');
        }

        if (request.payload.roles && request.payload.roles.includes('admin') && !request.auth.credentials.roles.includes('admin')) {
          return Boom.badRequest('Only admins create other admins');
        }

        if (request.payload.disabled && typeof request.payload.disabled === 'boolean' && !request.auth.credentials.roles.includes('admin')) {
          return Boom.badRequest('Only admins can enable/disabled users');
        }

        if (request.payload.system_user && typeof request.payload.system_user === 'boolean' && !request.auth.credentials.roles.includes('admin')) {
          return Boom.badRequest('Only admins can promote/demote users to system users');
        }

        const query = {};

        let user_query = null;

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          // console.log('invalid ObjectID');
          return Boom.badRequest('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(usersTable).findOne(query);
          if (!result) {
            return Boom.badRequest('No record found for id: ' + request.params.id );
          }

          user_query = result;
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error', err);
        }

        //Trying to change the username?
        if (request.payload.username && request.payload.username !== user_query.username) {

          const usernameQuery = { username: request.payload.username };
          //check if username already exists for a different account
          try {
            const result = await db.collection(usersTable).findOne(usernameQuery);

            if (result) {
              return Boom.badRequest('Username already exists');
            }
          }
          catch (err) {
            console.log('ERROR:', err);
            return Boom.serverUnavailable('database error', err);
          }
        }

        const user = request.payload;

        if (request.payload.password) {
          const password = request.payload.password;

          const hashedPassword = await new Promise((resolve, reject) => {

            Bcrypt.hash(password, saltRounds, (err, hash) => {

              if (err) {
                reject(err);
              }

              resolve(hash);
            });
          });

          user.password = hashedPassword;
        }

        try {
          await db.collection(usersTable).updateOne(query, { $set: user });
          return h.response().code(204);
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
          // scope: ['admin', 'write_users']
        },
        validate: {
          headers: authorizationHeader,
          params: userParam,
          payload: userUpdatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },
        description: 'Update a user record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['users','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/users/{id}',
      async handler(request, h) {

        //Can't delete yourself
        if (request.auth.credentials.id === request.params.id) {
          return Boom.badRequest('Users cannot delete themselves');
        }

        const query = {};

        try {
          query._id = new ObjectID(request.params.id);
        }
        catch (err) {
          // console.log('invalid ObjectID');
          return Boom.unauthorized('id must be a single String of 12 bytes or a string of 24 hex characters');
        }

        try {
          const result = await db.collection(usersTable).findOne(query);
          if (!result) {
            return Boom.notFound('No record found for user id: ' + request.params.id);
          }
          else if (!request.auth.credentials.roles.includes('admin') && result.system_user) {
            return Boom.unauthorized('Only admins can delete system users');
          }
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }

        try {
          await db.collection(usersTable).deleteOne(query);
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }

        if (useAccessControl) {
          try {
            await db.collection(cruisesTable).updateMany({}, { $pull: { cruise_access_list: { $in: [request.params.id] } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }

          try {
            await db.collection(loweringsTable).updateMany({}, { $pull: { lowering_access_list: { $in: [request.params.id] } } });
          }
          catch (err) {
            return Boom.serverUnavailable('database error', err);
          }
        }

        return h.response().code(204);

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_users']
        },
        validate: {
          headers: authorizationHeader,
          params: userParam
        },
        response: {
          status: {}
        },
        description: 'Delete a user record',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['users','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/users/{id}/token',
      async handler(request, h) {

        if (request.auth.credentials.id !== request.params.id && !request.auth.credentials.roles.includes('admin')) {
          return Boom.unauthorized('Only admins and the owner of this user can access this user\'s token.');
        }

        try {
          const result = await db.collection(usersTable).findOne({ _id: new ObjectID(request.params.id) });

          if (!result) {
            return Boom.notFound('No user found for id: ' + request.params.id);
          }

          const user = result;

          return h.response({ token: Jwt.sign( { id: user._id, scope: server.methods._rolesToScope(user.roles), roles: user.roles }, SECRET_KEY) }).code(200);
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: userParam
        },
        response: {
          status: {
            200: userToken
          }
        },
        description: 'This is the route used for retrieving a user\'s JWT based on the user\'s ID.',
        notes: '<div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 200</strong> - authenication successful</div>\
          <div class="panel-body">Returns JSON object conatining user information</div>\
        </div>\
        <div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
          <div class="panel-body">Returns nothing</div>\
        </div>',
        tags: ['users', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/users/{id}/loginToken',
      async handler(request, h) {

        if (request.auth.credentials.id !== request.params.id && !request.auth.credentials.roles.includes('admin')) {
          return Boom.unauthorized('Only admins and the owner of this user can access this user\'s token.');
        }

        try {
          const result = await db.collection(usersTable).findOne({ _id: new ObjectID(request.params.id) });

          if (!result) {
            return Boom.notFound('No user found for id: ' + request.params.id);
          }

          const user = result;

          return h.response({ loginToken: user.loginToken }).code(200);
        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: userParam
        },
        response: {
          status: {
            200: loginToken
          }
        },
        description: 'This is the route used for retrieving a user\'s loginToken based on the user\'s ID.',
        notes: '<div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 200</strong> - request successful</div>\
          <div class="panel-body">Returns JSON object conatining user information</div>\
        </div>\
        <div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
          <div class="panel-body">Returns nothing</div>\
        </div>',
        tags: ['users', 'api']
      }
    });
  }
};
