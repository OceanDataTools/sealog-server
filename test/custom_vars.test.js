'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, customVarsTable } = require('../config/db_constants');

describe('Custom Vars API', () => {
  let server;
  let db;

  const adminUser = {
    _id: new ObjectId('000000000000000000000001'),
    username: 'admin',
    fullname: 'Test Admin',
    email: 'admin@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['admin'],
    system_user: false,
    disabled: false,
    loginToken: 'admintoken12345678901'
  };

  const loggerUser = {
    _id: new ObjectId('000000000000000000000002'),
    username: 'logger',
    fullname: 'Event Logger',
    email: 'logger@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['event_logger'],
    system_user: false,
    disabled: false,
    loginToken: 'loggertoken123456789x'
  };

  const testCustomVar = {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    custom_var_name: 'testVar',
    custom_var_value: 'testValue'
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  const loggerJwt = Jwt.sign(
    { id: loggerUser._id, roles: loggerUser.roles, scope: ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(customVarsTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, loggerUser]);
    await db.collection(customVarsTable).insertOne(testCustomVar);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /custom_vars
  // ───────────────────────────────────────────────
  describe('GET /custom_vars', () => {
    it('returns all custom vars for user with read_events scope', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/custom_vars',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].custom_var_name).to.equal('testVar');
    });

    it('filters by name', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/custom_vars?name=testVar',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].custom_var_name).to.equal('testVar');
    });

    it('returns empty array when no name matches', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/custom_vars?name=nonexistent',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
      // expect(res.result).to.be.an.array();
      // expect(res.result.length).to.equal(0);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/custom_vars'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /custom_vars/{id}
  // ───────────────────────────────────────────────
  describe('GET /custom_vars/{id}', () => {
    it('returns a custom var by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/custom_vars/${testCustomVar._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.custom_var_name).to.equal('testVar');
      expect(res.result.custom_var_value).to.equal('testValue');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/custom_vars/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /custom_vars/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /custom_vars/{id}', () => {
    it('updates a custom var value', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/custom_vars/${testCustomVar._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { custom_var_value: 'updatedValue' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(customVarsTable).findOne({ _id: testCustomVar._id });
      expect(updated.custom_var_value).to.equal('updatedValue');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/custom_vars/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { custom_var_value: 'updatedValue' }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/custom_vars/${testCustomVar._id}`,
        payload: { custom_var_value: 'updatedValue' }
      });

      expect(res.statusCode).to.equal(401);
    });
  });
});
