const SECRET_KEY = require('../../../config/secret');
const { randomAsciiString, hashedPassword } = require('../../../lib/utils');

const Bcrypt = require('bcryptjs');
const Boom = require('@hapi/boom');
const Jwt = require('jsonwebtoken');
const Axios = require('axios');
const Crypto = require('crypto');

const resetPasswordTokenExpires = 15; //minutes

const {
  refreshTokensTable,
  usersTable
} = require('../../../config/db_constants');

const {
  senderAddress,
  emailTransporter,
  notificationEmailAddresses
} = require('../../../config/email_settings');

const {
  reCaptchaSecret,
  registeringUserRoles,
  disableRegisteringUsers
} = require('../../../config/server_settings');

const {
  authorizationHeader,
  databaseInsertResponse,
  forgotPasswordPayload,
  forgotPasswordSuccessResponse,
  loginPayload,
  loginSuccessResponse,
  registerPayload,
  refreshPayload,
  refreshSuccessResponse,
  resetPasswordPayload,
  userSuccessResponse,
  userToken
} = require('../../../lib/validations');

const _rolesToScope = (roles) => {

  if (!roles) {
    return [];
  }

  if (roles.includes('admin')) {
    return ['admin'];
  }

  const scope = roles.reduce((scope_accumulator, role) => {

    if (role === 'event_watcher') {
      return scope_accumulator.concat(['read_events', 'read_cruises', 'read_lowerings']);
    }
    else if (role === 'event_logger') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings']);
    }
    else if (role === 'event_manager') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings']);
    }
    else if (role === 'template_manager') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'read_lowerings']);
    }
    else if (role === 'cruise_manager') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'write_cruises', 'read_lowerings', 'write_lowerings', 'read_users', 'write_users']);
    }
    else if (role === 'power_logger') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings', 'read_admin_templates']);
    }
    else if (role === 'apikey_manager') {
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'write_cruises', 'read_lowerings', 'write_lowerings', 'read_users', 'write_users', 'read_api_keys', 'write_api_keys']);
    }

    return scope_accumulator;
  }, []);

  return [...new Set(scope)];
};

const _renameAndClearFields = (doc) => {

  //rename id
  doc.id = doc._id;
  delete doc._id;

  //remove fields entirely
  delete doc.password;
  delete doc.loginToken;
  delete doc.resetPasswordToken;
  delete doc.resetPasswordExpires;

  return doc;
};

exports.plugin = {
  name: 'routes-auth',
  dependencies: ['hapi-mongodb'],
  register: (server, options) => {

    server.method('_rolesToScope', _rolesToScope);

    // Need to add a register route
    server.route({
      method: 'POST',
      path: '/auth/register',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        try {
          const result = await db.collection(usersTable).findOne({ username: request.payload.username });
          if (result) {

            return h.response({ statusCode: 401, error: 'invalid registration', message: 'username already exists' }).code(401);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        try {
          const result = await db.collection(usersTable).findOne({ email: request.payload.email });
          if (result) {

            return h.response({ statusCode: 401, error: 'invalid registration', message: 'email already exists' }).code(401);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (reCaptchaSecret) {
          try {
            const reCaptchaVerify = await Axios.get('https://www.google.com/recaptcha/api/siteverify?secret=' + reCaptchaSecret + '&response=' + request.payload.reCaptcha + '&remoteip=' + request.info.remoteAddress
            );

            if (!reCaptchaVerify.data.success) {
              return Boom.unauthorized('reCaptcha failed');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('reCaptcha error', err);
          }
        }

        const user = request.payload;

        if (user.reCaptcha !== '') {
          delete user.reCaptcha;
        }

        user.last_login = new Date();
        user.roles = registeringUserRoles;
        user.system_user = false;
        user.disabled = disableRegisteringUsers;
        user.loginToken = randomAsciiString(20);
        user.password = hashedPassword(request.payload.password);

        try {
          const result = await db.collection(usersTable).insertOne(user);
          if (!result) {
            return h.response({ 'statusCode': 400, 'message': 'Bad request' }).code(400);
          }

          const disabledAccountTxt = (disableRegisteringUsers) ? '<p>For security reasons, accounts created via self-registration are disabled by default.  The system adminstrator has been notified of your account request and will enable the account shortly.</p>' : '';

          if (emailTransporter !== null) {
            let mailOptions = {
              from: senderAddress,
              to: request.payload.email,
              subject: 'Welcome to Sealog',
              html: `<p>Welcome to Sealog. If you are receiving this email you have just created an account on Sealog (${request.info.hostname}).</p>
              ${disabledAccountTxt}
              <p>If you have any questions please reply to this email address</p><p>Thanks!</p>`
            };

            emailTransporter.sendMail(mailOptions, (err) => {

              if (err) {
                console.error('ERROR: ', err);
              }
            });

            mailOptions = {
              from: senderAddress,
              to: notificationEmailAddresses,
              subject: 'New Sealog User Registration',
              html: `<p>New user: ${user.username}  ( ${user.fullname} ) has just registered an account with Sealog (${request.info.hostname}). Please ensure this user's access permissions have been configured correctly.</p>`
            };

            emailTransporter.sendMail(mailOptions, (err) => {

              if (err) {
                console.log('ERROR:', err);
              }
            });
          }

          return h.response(result).code(201);

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        validate: {
          payload: registerPayload
        },
        response: {
          status: {
            201: databaseInsertResponse
          }
        },
        description: 'This is the route used for registering new users.',
        tags: ['auth', 'api']
      }
    });

    // Need to add a register route
    server.route({
      method: 'PATCH',
      path: '/auth/resetPassword',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        let user = null;

        try {
          const result = await db.collection(usersTable).findOne({ resetPasswordToken: request.payload.token });
          if (!result) {
            return h.response({ statusCode: 401, error: 'invalid token', message: 'password reset token is invalid' }).code(401);
          }
          else if (result.resetPasswordExpires < new Date().getTime()) {
            await db.collection(usersTable).updateOne({ _id: result._id }, { $set: { resetPasswordToken: null, resetPasswordExpires: null } });
            return h.response({ statusCode: 401, error: 'invalid token', message: 'password reset token has expired' }).code(401);
          }

          user = result;

        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (reCaptchaSecret) {
          try {
            const reCaptchaVerify = await Axios.get('https://www.google.com/recaptcha/api/siteverify?secret=' + reCaptchaSecret + '&response=' + request.payload.reCaptcha + '&remoteip=' + request.info.remoteAddress);

            if (!reCaptchaVerify.data.success) {
              return Boom.unauthorized('reCaptcha failed');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('reCaptcha error', err);
          }
        }

        const hashedPasswd = hashedPassword(request.payload.password);

        try {
          await db.collection(usersTable).updateOne({ _id: user._id }, { $set: { password: hashedPasswd, resetPasswordToken: null, resetPasswordExpires: null } });
          return h.response().code(204);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        validate: {
          payload: resetPasswordPayload
        },
        response: {
          status: {}
        },
        description: 'This is the route used for registering new users.',
        // notes: 'The POST payload must include a username, full name, password, email address and reCaptcha hash key',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/login',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let user = null;

        try {

          if (request.payload.loginToken) {
            const result = await db.collection(usersTable).findOne({ loginToken: request.payload.loginToken });
            if (!result) {
              return Boom.unauthorized('bad loginToken');
            }

            user = result;

          }
          else {
            const result = await db.collection(usersTable).findOne({ username: request.payload.username });
            if (!result) {
              return Boom.unauthorized('unknown user or bad password');
            }

            user = result;

            const pass = Bcrypt.compareSync(request.payload.password, user.password);

            if (!pass) {
              return Boom.unauthorized('unknown user or bad password');
            }
          }

          if (user.disabled) {
            return Boom.unauthorized('account is disabled');
          }
        }
        catch (err) {
          console.log('ERROR:', err);
          return Boom.serverUnavailable('database error');
        }

        if (reCaptchaSecret) {
          try {
            const reCaptchaVerify = await Axios.get('https://www.google.com/recaptcha/api/siteverify?secret=' + reCaptchaSecret + '&response=' + request.payload.reCaptcha + '&remoteip=' + request.info.remoteAddress);

            if (!reCaptchaVerify.data.success) {
              return Boom.unauthorized('reCaptcha failed');
            }
          }
          catch (err) {
            console.log(err);
            return Boom.serverUnavailable('reCaptcha error');
          }
        }

        // --- ADD: Refresh Token Generation ---
        const refreshToken = Jwt.sign(
          {
            id: user._id.toString(),
            type: 'refresh',
            jti: Crypto.randomBytes(16).toString('hex')
          },
          SECRET_KEY,
          { expiresIn: '30d' }   // long lived
        );

        // Hash only the JWT signature (43 chars) — bcrypt truncates at 72 bytes so
        // hashing the full token is unsafe for long JWTs with shared prefixes.
        const hashedRefresh = Bcrypt.hashSync(refreshToken.split('.')[2], 10);

        try {
          await db.collection(refreshTokensTable).insertOne({
            user_id: new ObjectID(user._id),
            hashed_token: hashedRefresh,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
            user_agent: request.headers['user-agent'] || null,
            ip: request.info.remoteAddress
          });

          // Short-lived access token — unchanged
          const accessToken = Jwt.sign(
            { id: user._id, scope: _rolesToScope(user.roles), roles: user.roles },
            SECRET_KEY,
            { expiresIn: '15m' }    // recommended
          );

          // --- CHANGE: return refresh_token too ---
          return h.response({
            access_token: accessToken,
            refresh_token: refreshToken,
            id: user._id.toString(),
            token_type: 'bearer'
          }).code(200);
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }
      },
      config: {
        validate: {
          payload: loginPayload
        },
        response: {
          status: {
            200: loginSuccessResponse
          }
        },
        description: 'Obtain JWT authenication via user/pass.',
        notes: 'Use this method to obtain a JWT based on the provided username/password.',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/auth/validate',
      handler(request, h) {

        return h.response({ status: 'valid' }).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader
        },
        description: 'This is the route used for verifying the JWT is valid.',
        notes: 'Simple utiliy route that verifies the JWT included in the http call header is valid.',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/forgotPassword',
      async handler(request, h) {

        const db = request.mongo.db;
        // const ObjectID = request.mongo.ObjectID;

        let user = null;

        try {
          const result = await db.collection(usersTable).findOne({ email: request.payload.email });
          if (!result) {
            return Boom.badRequest('no user found for that email address');
          }

          if (result.disabled) {
            return Boom.badRequest('the account associated with email address is disabled');
          }

          user = result;
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        const token = Crypto.randomBytes(20).toString('hex');

        try {
          await db.collection(usersTable).updateOne({ _id: user._id }, { $set: { resetPasswordToken: token, resetPasswordExpires: Date.now() + (resetPasswordTokenExpires * 60 * 1000) } });
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (reCaptchaSecret) {
          try {
            const reCaptchaVerify = await Axios.get('https://www.google.com/recaptcha/api/siteverify?secret=' + reCaptchaSecret + '&response=' + request.payload.reCaptcha + '&remoteip=' + request.info.remoteAddress);

            if (!reCaptchaVerify.data.success) {
              return Boom.unauthorized('reCaptcha failed');
            }
          }
          catch (err) {
            return Boom.serverUnavailable('reCaptcha error', err);
          }
        }

        const resetLink = `${request.payload.resetURL}${token}`;
        const mailOptions = {
          from: senderAddress,
          to: request.payload.email,
          subject: 'Sealog Password Reset Request',
          html: `<p>Sealog has recieved a request to reset the Sealog account associated with this email address. If you did not request this then please just ignore this message. If you would like to change your password please click on the link below.  This link will expire in ${resetPasswordTokenExpires.toString()} minutes:</p>
          <p><a href='${resetLink}'>${resetLink}</a></p>`
        };

        if (emailTransporter !== null) {
          emailTransporter.sendMail(mailOptions, (err) => {

            if (err) {
              console.log('ERROR:', err);
            }
          });
        }

        return h.response({ statusCode: 200, message: 'password reset email sent' }).code(200);
      },
      config: {
        validate: {
          payload: forgotPasswordPayload
        },
        response: {
          status: {
            200: forgotPasswordSuccessResponse
          }
        },
        description: 'Reset the user\'s password.',
        notes: 'Use this method to reset optain a password reset email.\
          To prevent BOT abuse this call also optionally take a recaptcha hash key',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/auth/profile',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        const query = { _id: new ObjectID(request.auth.credentials.id) };

        try {
          const result = await db.collection(usersTable).findOne(query);

          const cleanedResult = _renameAndClearFields(result);
          return h.response(cleanedResult).code(200);

        }
        catch (err) {
          console.log('ERROR:', err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
          // scope: ['admin', 'read_users']
        },
        validate: {
          headers: authorizationHeader
        },
        response: {
          status: {
            200: userSuccessResponse
          }
        },
        description: 'Return a user record based on the user JWT',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['auth','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/auth/profile/token',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        try {
          const user = await db.collection(usersTable).findOne({ _id: new ObjectID(request.auth.credentials.id) });

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
          headers: authorizationHeader
        },
        response: {
          status: {
            200: userToken
          }
        },
        description: 'This is the route used for retrieving a user\'s JWT based on the user\'s JWT.',
        notes: '<div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 200</strong> - authenication successful</div>\
          <div class="panel-body">Returns JSON object conatining user information</div>\
        </div>\
        <div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
          <div class="panel-body">Returns nothing</div>\
        </div>',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/refresh',
      async handler(request, h) {

        const { refresh_token } = request.payload;
        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        let decoded;
        try {
          decoded = Jwt.verify(refresh_token, SECRET_KEY);
          if (decoded.type !== 'refresh') {
            return Boom.unauthorized('invalid token type');
          }
        }
        catch (err) {
          return Boom.unauthorized('invalid refresh token');
        }

        const user = await db.collection(usersTable).findOne({
          _id: new ObjectID(decoded.id)
        });

        if (!user) {
          return Boom.unauthorized('user not found');
        }

        if (user.disabled) {
          return Boom.unauthorized('account disabled');
        }

        // Search refresh_tokens collection
        const tokens = await db.collection(refreshTokensTable).find({
          user_id: user._id
        }).toArray();

        let matchingEntry = null;

        for (const entry of tokens) {
          if (Bcrypt.compareSync(refresh_token.split('.')[2], entry.hashed_token)) {
            matchingEntry = entry;
            break;
          }
        }

        if (!matchingEntry) {
          return Boom.unauthorized('invalid refresh token');
        }

        if (matchingEntry.expires_at < new Date()) {
          return Boom.unauthorized('refresh token expired');
        }

        // Issue a new access token
        const newAccessToken = Jwt.sign(
          { id: user._id, scope: _rolesToScope(user.roles), roles: user.roles },
          SECRET_KEY,
          { expiresIn: '15m' }
        );

        // Remove old token (rotate)
        await db.collection(refreshTokensTable).deleteOne({ _id: matchingEntry._id });

        // Create new token
        const newRefreshToken = Jwt.sign(
          { id: user._id.toString(), type: 'refresh', jti: Crypto.randomBytes(16).toString('hex') },
          SECRET_KEY,
          { expiresIn: '30d' }
        );

        await db.collection(refreshTokensTable).insertOne({
          user_id: user._id,
          hashed_token: Bcrypt.hashSync(newRefreshToken.split('.')[2], 10),
          created_at: new Date(),
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
        });

        return h.response({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          token_type: 'bearer'
        }).code(200);
      },
      config: {
        validate: {
          payload: refreshPayload
        },
        response: {
          status: {
            200: refreshSuccessResponse
          }
        },
        description: 'This is the route used to obtain a new access_token JWT based on the supplied refresh JWT.',
        notes: '<div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 200</strong> - re-authenication successful</div>\
          <div class="panel-body">Returns JSON object conatining updated access_token</div>\
        </div>\
        <div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 401</strong> - authenication failed</div>\
          <div class="panel-body">Returns nothing</div>\
        </div>',
        tags: ['auth', 'api']
      }
    });

    server.route({
      method: 'POST',
      path: '/auth/logout',
      async handler(request, h) {

        const { refresh_token } = request.payload;
        const db = request.mongo.db;

        const entries = await db.collection(refreshTokensTable).find().toArray();

        for (const entry of entries) {
          if (Bcrypt.compareSync(refresh_token.split('.')[2], entry.hashed_token)) {
            await db.collection(refreshTokensTable).deleteOne({ _id: entry._id });
            return h.response({ success: true }).code(200);
          }
        }

        return h.response({ status: true }).code(200); // No leak of invalid token info
      },
      config: {
        validate: {
          payload: refreshPayload
        },
        description: 'This is the route used to logout / revoke refresh_tokens.',
        notes: '<div class="panel panel-default">\
          <div class="panel-heading"><strong>Status Code: 200</strong> - logout successful</div>\
          <div class="panel-body">Returns JSON object conatining success value</div>\
        </div>',
        tags: ['auth', 'api']
      }
    });
  }
};
