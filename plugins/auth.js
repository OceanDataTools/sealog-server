const Boom = require('@hapi/boom');
const Bcrypt = require('bcryptjs');
const SECRET_KEY = require('../config/secret');

const {
  apiKeysTable,
  usersTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'auth',
  dependencies: ['hapi-mongodb', 'hapi-auth-jwt2'],
  register: (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const validateJWT = async (decoded, request) => {

      try {
        const result = await db.collection(usersTable).findOne({ _id: new ObjectID(decoded.id) });
        if (!result) {
          return { isValid: false };
        }
        else if ( result.disabled) {
          return { isValid: false };
        }
        else if ( !decoded.roles || result.roles.toString() !== decoded.roles.toString() ) {
          return { isValid: false };
        }

        // Update last_login no more than once every 10 minutes
        if (!result.last_login || Date.now() - result.last_login.getTime() > 600000) {
          await db.collection(usersTable).updateOne({ _id: new ObjectID(decoded.id) }, { $set: { last_login: new Date() } });
        }

        return { isValid: true };

      }
      catch (err) {
        console.log(err);
        console.log('Validation ERROR:');
        return { isValid: false };
      }
    };

    server.auth.strategy('jwt', 'jwt', {
      key: SECRET_KEY,
      verifyOptions: {
        algorithms: ['HS256']
      },
      // Implement validation function
      validate: validateJWT
    });

    // ---------------- API KEY VALIDATION ----------------

    const validateApiKey = async (providedKey) => {

      if (!providedKey) {
        return null;
      }

      // Fetch only keys that are not disabled or deleted
      const keys = await db.collection(apiKeysTable).find({ disabled: { $ne: true } }).toArray();
      console.error('keys:',keys);

      for (const keyRecord of keys) {
        // Compare raw key to hashed key (correct order!!)
        const isMatch = await Bcrypt.compare(providedKey, keyRecord.key_hash);

        if (!isMatch) {
          continue; // try next key
        }

        // Check expiration
        if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
          // Key exists but is expired → treat as invalid
          return null;
        }

        // Key is valid and not expired
        return keyRecord;
      }

      // Nothing matched
      return null;
    };

    const apiKeyScheme = () => ({
      authenticate: async (request, h) => {

        const apiKey = request.headers['x-api-key'];

        if (!apiKey) {
          throw Boom.unauthorized('Missing API Key');
        }

        const keyRecord = await validateApiKey(apiKey);

        if (!keyRecord) {
          throw Boom.unauthorized('Invalid API Key');
        }

        const { user_id, scope, expires } = keyRecord;

        // Check expiration
        if (expires && new Date() > expires) {
          throw Boom.unauthorized('API Key expired');
        }

        // Verify user still exists
        const user = await db.collection(usersTable).findOne({ _id: new ObjectID(user_id) });
        if (!user || user.disabled) {
          throw Boom.unauthorized('User disabled or missing');
        }

        // Log usage
        await db.collection(apiKeysTable).updateOne(
          { _id: keyRecord._id },
          { $set: { last_used: new Date() } }
        );

        return h.authenticated({
          credentials: { id: user_id, scope, type: 'api-key' }
        });
      }
    });


    server.auth.scheme('api-key', apiKeyScheme);
    server.auth.strategy('api-key', 'api-key');
  }
};
