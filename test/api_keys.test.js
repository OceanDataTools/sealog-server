'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const { randomAsciiString, hashedApiKey } = require('../lib/utils');

const { apikeysTable, usersTable } = require('../config/db_constants')

const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const SECRET = require('../config/secret');

describe('Users API', () => {
  let server;
  let db;
  let users;

  const adminLoginToken = randomAsciiString(20)
  const normalLoginToken = randomAsciiString(20)
  const apiKey = randomAsciiString(20)
  const apiKeyHash = hashedApiKey(apiKey)

  const adminUser = {
    _id: ObjectId('000000000000000000000001'),
    username: 'admin',
    fullname: 'test_admin',
    email: 'admin@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['admin'],
    system_user: false,
    disabled: false,
    loginToken: adminLoginToken
  };

  const normalUser = {
    _id: ObjectId('000000000000000000000002'),
    username: 'bob',
    fullname: 'test_bob',
    email: 'bob@example.com',
    password: 'hashedbob',
    roles: ['cruise_manager'],
    system_user: false,
    disabled: false,
    loginToken: normalLoginToken
  };

  const apiKeyRecord = [
      {
        _id: ObjectId('000000000000000000000003'),
        user_id: ObjectId('000000000000000000000002'),  // Reference to users collection
        key_hash: apiKeyHash,  // We store a hash, never raw key
        label: 'Default Key',
        scope: ['read_cruises'],          // Optional: can match user scopes or add more granular scopes
        created: new Date(),
        last_used: null,
        disabled: false,
        expires: null
      }
    ];

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  const normalJwt = Jwt.sign(
    { id: normalUser._id, roles: normalUser.roles, scope: ['read_users'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;

    users = db.collection(usersTable);
    apikeys = db.collection(apikeysTable);

    await users.deleteMany({});
    await users.insertMany([adminUser, normalUser]);
    await apikeys.deleteMany({});
    await apikeys.insertMany([apiKeyRecord]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /users
  // ───────────────────────────────────────────────
  describe('GET /api_keys', () => {
    it('returns all api_keys for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/api_keys',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0]).to.not.include('key_hash');
    });

    // it('returns only non-system api_keys for non-admin', async () => {
    //   // mark admin as system user
    //   await api_keys.updateOne(
    //     { _id: adminUser._id },
    //     { $set: { system_user: true } }
    //   );

    //   const res = await server.inject({
    //     method: 'GET',
    //     url: '/sealog-server/api/v1/api_keys',
    //     headers: { Authorization: 'Bearer ' + normalJwt }
    //   });

    //   expect(res.statusCode).to.equal(200);
    //   expect(res.result.length).to.equal(1);
    //   expect(res.result[0].username).to.equal('bob');
    // });
  });

  // ───────────────────────────────────────────────
  // GET /api_keys/{id}
  // ───────────────────────────────────────────────
//   describe('GET /api_keys/{id}', () => {
//     it('returns the user for admin', async () => {
//       const res = await server.inject({
//         method: 'GET',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}`,
//         headers: { Authorization: 'Bearer ' + adminJwt }
//       });

//       expect(res.statusCode).to.equal(200);
//       expect(res.result.username).to.equal('bob');
//     });

//     it('blocks non-admin from accessing system_user', async () => {
//       await api_keys.updateOne(
//         { _id: ObjectId(adminUser._id) },
//         { $set: { system_user: true } }
//       );

//       const res = await server.inject({
//         method: 'GET',
//         url: `/sealog-server/api/v1/api_keys/${adminUser._id}`,
//         headers: { Authorization: 'Bearer ' + normalJwt }
//       });

//       expect(res.statusCode).to.equal(400);
//     });
//   });

//   // ───────────────────────────────────────────────
//   // POST /api_keys
//   // ───────────────────────────────────────────────
//   describe('POST /api_keys', () => {
//     it('creates a new user', async () => {
//       const payload = {
//         username: 'charlie',
//         password: 'pass123',
//         fullname: 'test_charlie',
//         email: 'charlie@example.com',
//         resetURL: 'https://example/reset/',
//         roles: ['event_logger']
//       };

//       const res = await server.inject({
//         method: 'POST',
//         url: '/sealog-server/api/v1/api_keys',
//         headers: { Authorization: 'Bearer ' + adminJwt },
//         payload
//       });

//       expect(res.statusCode).to.equal(201);

//       const newUser = await api_keys.findOne({ username: 'charlie' });
//       expect(newUser).to.exist();
//       expect(newUser.password).to.exist();
//     });

//     it('rejects duplicate username', async () => {
//       const payload = {
//         username: 'bob',
//         password: 'pass123',
//         fullname: 'test_bob',
//         email: 'x@example.com',
//         resetURL: 'https://example/reset/',
//         roles: ['event_logger']
//       };

//       const res = await server.inject({
//         method: 'POST',
//         url: '/sealog-server/api/v1/api_keys',
//         headers: { Authorization: 'Bearer ' + adminJwt },
//         payload
//       });

//       expect(res.statusCode).to.equal(409);
//     });
//   });

//   // ───────────────────────────────────────────────
//   // PATCH /api_keys/{id}
//   // ───────────────────────────────────────────────
//   describe('PATCH /api_keys/{id}', () => {
//     it('updates a user when authorized', async () => {
//       const res = await server.inject({
//         method: 'PATCH',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}`,
//         headers: { Authorization: 'Bearer ' + normalJwt },
//         payload: { fullname: 'new_bob' }
//       });

//       expect(res.statusCode).to.equal(204);

//       const updated = await api_keys.findOne({ _id: normalUser._id });
//       expect(updated.fullname).to.equal('new_bob');
//     });

//     it('disallows non-admin modifying system_user account', async () => {
//       await api_keys.updateOne(
//         { _id: adminUser._id },
//         { $set: { system_user: true } }
//       );

//       const res = await server.inject({
//         method: 'PATCH',
//         url: `/sealog-server/api/v1/api_keys/${adminUser._id}`,
//         headers: { Authorization: 'Bearer ' + normalJwt },
//         payload: { fullname: 'new_admin' }
//       });

//       expect(res.statusCode).to.equal(400);
//     });
//   });

//   // ───────────────────────────────────────────────
//   // DELETE /api_keys/{id}
//   // ───────────────────────────────────────────────
//   describe('DELETE /api_keys/{id}', () => {
//     it('deletes a user as admin', async () => {
//       const res = await server.inject({
//         method: 'DELETE',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}`,
//         headers: { Authorization: 'Bearer ' + adminJwt }
//       });

//       expect(res.statusCode).to.equal(204);

//       const gone = await api_keys.findOne({ _id: normalUser._id });
//       expect(gone).to.not.exist();
//     });

//     it('prevents user from deleting self', async () => {
//       const res = await server.inject({
//         method: 'DELETE',
//         url: `/sealog-server/api/v1/api_keys/${adminUser._id}`,
//         headers: { Authorization: 'Bearer ' + adminJwt }
//       });

//       expect(res.statusCode).to.equal(400);
//     });
//   });

//   // ───────────────────────────────────────────────
//   // GET /api_keys/{id}/token
//   // ───────────────────────────────────────────────
//   describe('GET /api_keys/{id}/token', () => {
//     it('returns JWT for owner', async () => {
//       const res = await server.inject({
//         method: 'GET',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}/token`,
//         headers: { Authorization: 'Bearer ' + normalJwt }
//       });

//       expect(res.statusCode).to.equal(200);
//       expect(res.result.token).to.exist();
//     });

//     it('blocks others unless admin', async () => {
//       const res = await server.inject({
//         method: 'GET',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}/token`,
//         headers: { Authorization: 'Bearer ' + adminJwt }
//       });

//       expect(res.statusCode).to.equal(200);
//     });
//   });

//   // ───────────────────────────────────────────────
//   // GET /api_keys/{id}/loginToken
//   // ───────────────────────────────────────────────
//   describe('GET /api_keys/{id}/loginToken', () => {
//     it('returns loginToken for user', async () => {
//       const res = await server.inject({
//         method: 'GET',
//         url: `/sealog-server/api/v1/api_keys/${normalUser._id}/loginToken`,
//         headers: { Authorization: 'Bearer ' + normalJwt }
//       });

//       expect(res.statusCode).to.equal(200);
//       expect(res.result.loginToken).to.equal(normalLoginToken);
//     });
//   });
});
