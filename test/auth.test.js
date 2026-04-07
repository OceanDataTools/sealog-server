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
const { usersTable } = require('../config/db_constants');

describe('Auth API', () => {
  let server;
  let db;

  const loginToken = randomAsciiString(20);
  const plainPassword = 'testpass';
  const hashedPassword = Bcrypt.hashSync(plainPassword, 1);

  const adminUser = {
    _id: new ObjectId('000000000000000000000001'),
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
    await db.collection(usersTable).insertOne(adminUser);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // POST /auth/login
  // ───────────────────────────────────────────────
  describe('POST /auth/login', () => {
    it('returns token and id on valid username/password login', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { username: 'admin', password: plainPassword }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.token).to.exist();
      expect(res.result.id).to.exist();
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

    it('returns token on valid loginToken', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/auth/login',
        payload: { loginToken }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.token).to.exist();
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

});

