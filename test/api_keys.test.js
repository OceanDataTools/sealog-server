'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const { randomAsciiString, hashedApiKey } = require('../lib/utils');

const { apiKeysTable, usersTable } = require('../config/db_constants');

const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const SECRET = require('../config/secret');

describe('API Keys API', () => {
  let server;
  let db;
  let users;
  let api_keys;

  const apiKey = randomAsciiString(20);
  const apiKeyHash = hashedApiKey(apiKey);

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
    loginToken: randomAsciiString(20)
  };

  const normalUser = {
    _id: ObjectId('000000000000000000000002'),
    username: 'bob',
    fullname: 'test_bob',
    email: 'bob@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['event_logger'],
    system_user: false,
    disabled: false,
    loginToken: randomAsciiString(20)
  };

  // Key owned by adminUser
  const adminApiKey = {
    _id: ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    user_id: ObjectId('000000000000000000000001'),
    key_hash: apiKeyHash,
    label: 'Admin Key',
    scope: ['read_cruises'],
    created: new Date(),
    last_used: null,
    disabled: false,
    expires: null
  };

  // Key owned by normalUser
  const normalApiKey = {
    _id: ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    user_id: ObjectId('000000000000000000000002'),
    key_hash: 'otherhash',
    label: 'Bob Key',
    scope: [],
    created: new Date(),
    last_used: null,
    disabled: false,
    expires: null
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  // A JWT for normalUser that satisfies the read_apikeys scope check
  const normalApiKeyJwt = Jwt.sign(
    { id: normalUser._id, roles: normalUser.roles, scope: ['read_apikeys', 'write_api_keys', 'create_api_keys'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;

    users = db.collection(usersTable);
    api_keys = db.collection(apiKeysTable);

    await users.deleteMany({});
    await users.insertMany([adminUser, normalUser]);
    await api_keys.deleteMany({});
    await api_keys.insertMany([adminApiKey, normalApiKey]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /api_keys
  // ───────────────────────────────────────────────
  describe('GET /api_keys', () => {
    it('returns api keys owned by the authenticated user', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/api_keys',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].label).to.equal('Admin Key');
    });

    it('omits key_hash from response', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/api_keys',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result[0].key_hash).to.not.exist();
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/api_keys'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /api_keys/{id}
  // ───────────────────────────────────────────────
  describe('GET /api_keys/{id}', () => {
    it('returns an api key by id for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/api_keys/${adminApiKey._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.label).to.equal('Admin Key');
      expect(res.result.key_hash).to.not.exist();
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/api_keys/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 400 when non-admin accesses another user\'s key', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/api_keys/${adminApiKey._id}`,
        headers: { Authorization: 'Bearer ' + normalApiKeyJwt }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // POST /api_keys
  // ───────────────────────────────────────────────
  describe('POST /api_keys', () => {
    it('creates a new api key for the authenticated user', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/api_keys',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          label: 'My New Key'
        }
      });

      expect(res.statusCode).to.equal(201);
      expect(res.result.id).to.exist();
      expect(res.result.key).to.exist();
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/api_keys',
        payload: { label: 'No Auth Key' }
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /api_keys/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /api_keys/{id}', () => {
    it('updates an api key label', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/api_keys/${adminApiKey._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { label: 'Updated Label' }
      });

      expect(res.statusCode).to.equal(200);
      const updated = await api_keys.findOne({ _id: adminApiKey._id });
      expect(updated.label).to.equal('Updated Label');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/api_keys/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { label: 'Ghost Key' }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 400 when non-admin updates another user\'s key', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/api_keys/${adminApiKey._id}`,
        headers: { Authorization: 'Bearer ' + normalApiKeyJwt },
        payload: { label: 'Stolen Label' }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /api_keys/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /api_keys/{id}', () => {
    it('soft-disables an api key (record still exists)', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/api_keys/${adminApiKey._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      const record = await api_keys.findOne({ _id: adminApiKey._id });
      expect(record).to.exist();
      expect(record.disabled).to.equal(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/api_keys/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });
});
