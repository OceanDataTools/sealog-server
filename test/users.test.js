'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable } = require('../config/db_constants');

describe('Users API', () => {
  let server;
  let db;

  const adminUser = {
    _id: ObjectId('000000000000000000000001'),
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

  const regularUser = {
    _id: ObjectId('000000000000000000000002'),
    username: 'bob',
    fullname: 'Bob Smith',
    email: 'bob@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['event_logger'],
    system_user: false,
    disabled: false,
    loginToken: 'bobstoken12345678901'
  };

  const systemUser = {
    _id: ObjectId('000000000000000000000003'),
    username: 'system',
    fullname: 'System User',
    email: 'system@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['event_watcher'],
    system_user: true,
    disabled: false,
    loginToken: 'systemtoken1234567890'
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  const regularJwt = Jwt.sign(
    { id: regularUser._id, roles: regularUser.roles, scope: ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings'] },
    SECRET
  );

  const cruiseManagerJwt = Jwt.sign(
    { id: regularUser._id, roles: ['cruise_manager'], scope: ['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'write_cruises', 'read_lowerings', 'write_lowerings', 'read_users', 'write_users'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, regularUser, systemUser]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /users
  // ───────────────────────────────────────────────
  describe('GET /users', () => {
    it('returns all users including system users for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(3);
      expect(res.result[0].password).to.not.exist();
    });

    it('excludes system users for non-admin with read_users scope', async () => {
      const jwt = Jwt.sign(
        { id: regularUser._id, roles: ['cruise_manager'], scope: ['read_users', 'write_users'] },
        SECRET
      );
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + jwt }
      });

      expect(res.statusCode).to.equal(200);
      const usernames = res.result.map((u) => u.username);
      expect(usernames).to.not.include('system');
    });

    it('returns 403 for user without read_users scope', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(403);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/users'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /users/{id}
  // ───────────────────────────────────────────────
  describe('GET /users/{id}', () => {
    it('returns a user by id for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.username).to.equal('bob');
      expect(res.result.password).to.not.exist();
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/users/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('blocks non-admin from accessing a system user', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });
      const jwt = Jwt.sign(
        { id: regularUser._id, roles: ['cruise_manager'], scope: ['read_users'] },
        SECRET
      );

      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${systemUser._id}`,
        headers: { Authorization: 'Bearer ' + jwt }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // POST /users
  // ───────────────────────────────────────────────
  describe('POST /users', () => {
    it('creates a new user as admin', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          username: 'charlie',
          fullname: 'Charlie Brown',
          email: 'charlie@example.com',
          password: 'pass123',
          roles: ['event_logger'],
          resetURL: 'https://example.com/reset/'
        }
      });

      expect(res.statusCode).to.equal(201);
      const created = await db.collection(usersTable).findOne({ username: 'charlie' });
      expect(created).to.exist();
    });

    it('returns 409 for duplicate username', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          username: 'bob',
          fullname: 'Bob Clone',
          email: 'bobclone@example.com',
          password: 'pass',
          roles: ['event_logger'],
          resetURL: 'https://example.com/reset/'
        }
      });

      expect(res.statusCode).to.equal(409);
    });

    it('returns 403 without write_users scope', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/users',
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: {
          username: 'charlie',
          fullname: 'Charlie Brown',
          email: 'charlie@example.com',
          password: 'pass123',
          roles: ['event_logger'],
          resetURL: 'https://example.com/reset/'
        }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /users/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /users/{id}', () => {
    it('allows a user to update their own record', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: { fullname: 'Robert Smith' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(usersTable).findOne({ _id: regularUser._id });
      expect(updated.fullname).to.equal('Robert Smith');
    });

    it('allows admin to update any user', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { fullname: 'Bobby Smith' }
      });

      expect(res.statusCode).to.equal(204);
    });

    it('blocks non-admin from updating another user', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/users/${adminUser._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: { fullname: 'Hacked' }
      });

      expect(res.statusCode).to.equal(400);
    });

    it('blocks non-admin from granting admin role', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: { roles: ['admin'] }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /users/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /users/{id}', () => {
    it('deletes a user as admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(usersTable).findOne({ _id: regularUser._id });
      expect(gone).to.not.exist();
    });

    it('prevents a user from deleting themselves', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/users/${adminUser._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(400);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/users/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 403 without write_users scope', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/users/${regularUser._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // GET /users/{id}/token
  // ───────────────────────────────────────────────
  describe('GET /users/{id}/token', () => {
    it('returns JWT token for the user themselves', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${regularUser._id}/token`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.token).to.exist();
    });

    it('returns JWT token for any user when requested by admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${regularUser._id}/token`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.token).to.exist();
    });

    it('returns 401 when non-admin requests another user\'s token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${adminUser._id}/token`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /users/{id}/loginToken
  // ───────────────────────────────────────────────
  describe('GET /users/{id}/loginToken', () => {
    it('returns loginToken for the user themselves', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${regularUser._id}/loginToken`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.loginToken).to.equal(regularUser.loginToken);
    });

    it('returns 401 when non-admin requests another user\'s loginToken', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/users/${adminUser._id}/loginToken`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(401);
    });
  });
});
