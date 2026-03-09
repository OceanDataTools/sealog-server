'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const { randomAsciiString } = require('../lib/utils');
const Bcrypt = require('bcryptjs');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { refreshTokensTable, usersTable } = require('../config/db_constants');

describe('Auth API', () => {
  let server;
  let db;

  const loginToken = randomAsciiString(20);
  const plainPassword = 'testpass';
  const hashedPassword = Bcrypt.hashSync(plainPassword, 1);

  const adminUser = {
    _id: ObjectId('000000000000000000000001'),
    username: 'admin',
    fullname: 'Test Admin',
    email: 'admin@example.com',
    password: hashedPassword,
    last_login: new Date(),
    roles: ['admin'],
    system_user: false,
    disabled: false,
    loginToken
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(refreshTokensTable).deleteMany({});
    await db.collection(usersTable).insertOne(adminUser);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // POST /auth/login
  // ───────────────────────────────────────────────
  describe('POST /auth/login', () => {
    it('returns access_token, refresh_token and id on valid username/password login', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.access_token).to.exist();
      expect(res.result.refresh_token).to.exist();
      expect(res.result.id).to.exist();
      expect(res.result.token_type).to.equal('bearer');
    });

    it('returns 401 on bad password', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: 'wrongpass' }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 401 on unknown username', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'nobody', password: 'pass' }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns access_token and refresh_token on valid loginToken', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { loginToken }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.access_token).to.exist();
      expect(res.result.refresh_token).to.exist();
    });

    it('returns 401 on invalid loginToken', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { loginToken: randomAsciiString(20) }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('updates last_login in the DB after a successful login', async () => {
      const before = adminUser.last_login;

      await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });

      const updated = await db.collection(usersTable).findOne({ _id: adminUser._id });
      expect(updated.last_login.getTime()).to.be.above(before.getTime());
    });

    it('returns 401 for disabled account', async () => {
      await db.collection(usersTable).updateOne(
        { _id: adminUser._id },
        { $set: { disabled: true } }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /auth/validate
  // ───────────────────────────────────────────────
  describe('GET /auth/validate', () => {
    it('returns valid status with a good JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/auth/validate',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.status).to.equal('valid');
    });

    it('returns 401 without a JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/auth/validate'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /auth/profile
  // ───────────────────────────────────────────────
  describe('GET /auth/profile', () => {
    it('returns the profile for the authenticated user', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/auth/profile',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.username).to.equal('admin');
      expect(res.result.password).to.not.exist();
    });

    it('returns 401 without a JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/auth/profile'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /auth/profile/token
  // ───────────────────────────────────────────────
  describe('GET /auth/profile/token', () => {
    it('returns a JWT token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/auth/profile/token',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.token).to.exist();
    });
  });

  // ───────────────────────────────────────────────
  // POST /auth/refresh
  // ───────────────────────────────────────────────
  describe('POST /auth/refresh', () => {
    it('returns new access_token and refresh_token for a valid refresh token', async () => {
      const loginRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });
      const { refresh_token } = loginRes.result;

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.access_token).to.exist();
      expect(res.result.refresh_token).to.exist();
      expect(res.result.token_type).to.equal('bearer');
    });

    it('rotates the refresh token so the old one is no longer valid', async () => {
      const loginRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });
      const { refresh_token } = loginRes.result;

      // Use the token once — must succeed for rotation to take effect
      const firstRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token }
      });
      expect(firstRes.statusCode).to.equal(200);

      // Re-using the same token should fail
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 401 for a token not stored in DB', async () => {
      const fakeToken = Jwt.sign(
        { id: adminUser._id.toString(), type: 'refresh' },
        SECRET,
        { expiresIn: '30d' }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token: fakeToken }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 401 for a token with wrong type claim', async () => {
      const wrongTypeToken = Jwt.sign(
        { id: adminUser._id.toString(), type: 'access' },
        SECRET,
        { expiresIn: '30d' }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token: wrongTypeToken }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 401 for a token signed with the wrong secret', async () => {
      const badToken = Jwt.sign(
        { id: adminUser._id.toString(), type: 'refresh' },
        'wrong-secret',
        { expiresIn: '30d' }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token: badToken }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 401 for a disabled user', async () => {
      const loginRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });
      const { refresh_token } = loginRes.result;

      await db.collection(usersTable).updateOne(
        { _id: adminUser._id },
        { $set: { disabled: true } }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token }
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // POST /auth/logout
  // ───────────────────────────────────────────────
  describe('POST /auth/logout', () => {
    it('returns 200 and removes the refresh token from the DB', async () => {
      const loginRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });
      const { refresh_token } = loginRes.result;

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/logout',
        payload: { refresh_token }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.success).to.equal(true);

      // Confirm token is gone — refresh should now fail
      const refreshRes = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/refresh',
        payload: { refresh_token }
      });
      expect(refreshRes.statusCode).to.equal(401);
    });

    it('returns 200 even for an unknown refresh token', async () => {
      const unknownToken = Jwt.sign(
        { id: adminUser._id.toString(), type: 'refresh' },
        SECRET,
        { expiresIn: '30d' }
      );

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/logout',
        payload: { refresh_token: unknownToken }
      });

      expect(res.statusCode).to.equal(200);
    });
  });
});
