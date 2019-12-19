
const Nodemailer = require('nodemailer');
const SECRET_KEY = require('../../../config/secret');

const Bcrypt = require('bcryptjs');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const Jwt = require('jsonwebtoken');
const Axios = require('axios');
const Crypto = require('crypto');

const resetPasswordTokenExpires = 15; //minutes

const {
  usersTable
} = require('../../../config/db_constants');

const {
  emailAddress, emailPassword, reCaptchaSecret, resetPasswordURL, registeringUserRoles, disableRegisteringUsers, notificationEmailAddresses
} = require('../../../config/email_constants');

const emailTransporter = Nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailAddress,
    pass: emailPassword
  }
});

const authorizationHeader = Joi.object({
  authorization: Joi.string().required()
}).options({ allowUnknown: true }).label('authorizationHeader');

const databaseInsertResponse = Joi.object({
  n: Joi.number().integer(),
  ok: Joi.number().integer(),
  insertedCount: Joi.number().integer(),
  insertedId: Joi.object()
}).label('databaseInsertResponse');

const registerPayload = Joi.object({
  reCaptcha: Joi.string().optional(),
  username: Joi.string().min(1).max(50).required(),
  fullname: Joi.string().min(1).max(50).required(),
  email: Joi.string().min(1).max(50).required(),
  password: Joi.string().allow('').max(50).required()
}).label('registerPayload');

const resetPasswordPayload = Joi.object({
  token: Joi.string().required(),
  reCaptcha: Joi.string().optional(),
  password: Joi.string().allow('').max(50).required()
}).label('resetPasswordPayload');

const loginPayload = Joi.object({
  reCaptcha: Joi.string().optional(),
  username: Joi.string().min(1).max(50).required(),
  password: Joi.string().allow('').max(50).required()
}).label('loginPayload');

const loginSuccessResponse = Joi.object({
  token: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/),
  id: Joi.string()
}).label('loginSuccessResponse');

const forgotPasswordPayload = Joi.object({
  email: Joi.string().min(1).max(50).required(),
  reCaptcha: Joi.string().optional()
}).label('forgotPasswordPayload');

const forgotPasswordSuccessResponse = Joi.object({
  statusCode: Joi.number().integer(),
  message: Joi.string()
}).label('forgotPasswordSuccessResponse');

const userSuccessResponse = Joi.object({
  id: Joi.object(),
  email: Joi.string().email(),
  system_user: Joi.boolean(),
  last_login: Joi.date(),
  username: Joi.string(),
  fullname: Joi.string(),
  roles: Joi.array().items(Joi.string()),
  disabled: Joi.boolean()
}).label('userSuccessResponse');

const _rolesToScope = (roles) => {

  if (!roles) {
    return [];
  }

  if (roles.includes("admin")){
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
      return scope_accumulator.concat(['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'write_cruises', 'read_lowerings', 'write_lowerings', 'read_users', 'write_users']);
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
  delete doc.resetPasswordToken;
  delete doc.resetPasswordExpires;

  return doc;
};

const saltRounds = 10;

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

            return h.response({ statusCode: 401, error: "invalid registration", message: 'username already exists' }).code(401);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        try {
          const result = await db.collection(usersTable).findOne({ email: request.payload.email });
          if (result) {

            return h.response({ statusCode: 401, error: "invalid registration", message: 'email already exists' }).code(401);
          }
        }
        catch (err) {
          return Boom.serverUnavailable('database error', err);
        }

        if (reCaptchaSecret !== "") {
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

        if (user.reCaptcha !== "") {
          delete user.reCaptcha;
        }

        user.last_login = new Date();
        user.roles = registeringUserRoles;
        user.system_user = false;
        user.disabled = disableRegisteringUsers;

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

        try {
          const result = await db.collection(usersTable).insertOne(user);
          if (!result) {
            return h.response({ "statusCode": 400, 'message': 'Bad request' }).code(400);
          }

          const disabledAccountTxt = (disableRegisteringUsers) ? "<p>For security reasons, accounts created via self-registration are disabled by default.  The system adminstrator has been notified of you account request and will enable the account shortly.</p>" : "";
          const emailTxt = '<p>Welcome to Sealog. If you are receiving this email you have just created an account on Sealog (' + request.info.hostname + ').</p>' + disabledAccountTxt + '<p>If you have any questions please reply to this email address</p><p>Thanks!</p>';

          let mailOptions = {
            from: emailAddress, // sender address
            to: request.payload.email, // list of receivers
            subject: 'Welcome to Sealog', // Subject line
            html: emailTxt
          };

          emailTransporter.sendMail(mailOptions, (err) => {

            if (err) {
              console.log("ERROR:", err);
            }
          });

          mailOptions = {
            from: emailAddress, // sender address
            to: emailAddress, // list of receivers
            subject: 'New Sealog User Registration', // Subject line
            html: '<p>New user: ' + user.username + ' ( ' + user.fullname + ' ) has just registered an account with Sealog (' + request.info.hostname + '). Please ensure this user\'s access permissions have been configured correctly.</p>'
          };

          if (notificationEmailAddresses.length > 0) {
            mailOptions.bcc = notificationEmailAddresses.join(',');
          }


          emailTransporter.sendMail(mailOptions, (err) => {

            if (err) {
              console.log("ERROR:", err);
            }
          });

          return h.response({ n: result.result.n, ok: result.result.ok, insertedCount: result.insertedCount, insertedId: result.insertedId }).code(201);

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
        tags: ['register', 'api']
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

        if (reCaptchaSecret !== "") {
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

        const password = request.payload.password;

        const hashedPassword = await new Promise((resolve, reject) => {

          Bcrypt.hash(password, saltRounds, (err, hash) => {

            if (err) {
              reject(err);
            }

            resolve(hash);
          });
        });

        try {
          await db.collection(usersTable).updateOne({ _id: user._id }, { $set: { password: hashedPassword, resetPasswordToken: null, resetPasswordExpires: null } });
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
        tags: ['register', 'auth', 'api']
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
          const result = await db.collection(usersTable).findOne({ username: request.payload.username });
          if (!result) {
            return Boom.unauthorized('unknown user or bad password');
          }

          user = result;
          const pass = Bcrypt.compareSync(request.payload.password, user.password);

          if (!pass) {
            return Boom.unauthorized('unknown user or bad password');
          }

          if (user.disabled) {
            return Boom.unauthorized('account is disabled');
          }
        }
        catch (err) {
          console.log("ERROR:", err);
          return Boom.serverUnavailable('database error');
        }

        if (reCaptchaSecret !== "") {
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

        user.last_login = new Date();

        try {
          await db.collection(usersTable).updateOne({ _id: new ObjectID(user._id) }, { $set: user });

          return h.response({ token: Jwt.sign( { id:user._id, scope: _rolesToScope(user.roles), roles: user.roles }, SECRET_KEY), id: user._id.toString() }).code(200);
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
        tags: ['login', 'auth', 'api']
      }
    });

    server.route({
      method: 'GET',
      path: '/auth/validate',
      handler(request, h) {

        return h.response({ status:"valid" }).code(200);
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
        tags: ['login', 'auth', 'api']
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

          if (user.disabled) {
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

        if (reCaptchaSecret !== "") {
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

        const resetLink = resetPasswordURL + token;
        const mailOptions = {
          from: emailAddress, // sender address
          to: request.payload.email, // list of receivers
          subject: 'Sealog Password Reset Request', // Subject line
          html: '<p>Sealog has recieved a request to reset the Sealog account associated with this email address. If you did not request this then please just ignore this message. If you would like to change your password please click on the link below.  This link will expire in ' + resetPasswordTokenExpires + ' minutes:</p><p><a href=' + resetLink + '>' + resetLink + '</a></p>'
        };

        emailTransporter.sendMail(mailOptions, (err) => {

          if (err) {
            console.log("ERROR:", err);
          }
        });

        return h.response({ statusCode:200, message:"password reset email sent" }).code(200);
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
        tags: ['password reset', 'api']
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
          console.log("ERROR:", err);
          Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth:{
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
        tags: ['user','auth','api']
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

          return h.response({ token: Jwt.sign( { id:user._id, scope: server.methods._rolesToScope(user.roles), roles: user.roles }, SECRET_KEY) }).code(200);
        }
        catch (err) {
          console.log("ERROR:", err);
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
            200: Joi.object({
              token: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/)
            }).label('user JWT')
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
        tags: ['login', 'auth', 'api']
      }
    });
  }
};