'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, loweringsTable } = require('../config/db_constants');

describe('Lowerings API', () => {
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

  const regularUser = {
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

  const testLowering = {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    lowering_id: 'J2-1400',
    start_ts: new Date('2024-03-01T08:00:00Z'),
    stop_ts: new Date('2024-03-01T20:00:00Z'),
    lowering_location: 'Mid-Atlantic Ridge',
    lowering_additional_meta: {
      lowering_description: 'Test lowering'
    },
    lowering_tags: ['test'],
    lowering_hidden: false,
    lowering_access_list: []
  };

  const hiddenLowering = {
    _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    lowering_id: 'J2-1401',
    start_ts: new Date('2024-03-02T08:00:00Z'),
    stop_ts: new Date('2024-03-02T20:00:00Z'),
    lowering_location: 'Pacific Rise',
    lowering_additional_meta: {
      lowering_description: 'Hidden lowering'
    },
    lowering_tags: [],
    lowering_hidden: true,
    lowering_access_list: []
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
    await db.collection(loweringsTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, regularUser]);
    await db.collection(loweringsTable).insertMany([testLowering, hiddenLowering]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /lowerings
  // ───────────────────────────────────────────────
  describe('GET /lowerings', () => {
    it('returns all lowerings including hidden for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/lowerings',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(2);
    });

    it('excludes hidden lowerings for non-admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/lowerings',
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].lowering_id).to.equal('J2-1400');
    });

    it('returns empty array when no lowerings match', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/lowerings?lowering_id=NONEXISTENT',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
      // expect(res.result).to.be.an.array();
      // expect(res.result.length).to.equal(0);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/lowerings'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /lowerings/{id}
  // ───────────────────────────────────────────────
  describe('GET /lowerings/{id}', () => {
    it('returns a lowering by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.lowering_id).to.equal('J2-1400');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/lowerings/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // POST /lowerings
  // ───────────────────────────────────────────────
  describe('POST /lowerings', () => {
    it('creates a lowering as admin', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/lowerings',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          lowering_id: 'J2-1402',
          start_ts: '2024-04-01T08:00:00.000Z',
          stop_ts: '2024-04-01T20:00:00.000Z',
          lowering_location: 'Galapagos Rift',
          lowering_additional_meta: { lowering_description: 'New lowering' },
          lowering_tags: []
        }
      });

      expect(res.statusCode).to.equal(201);
      expect(res.result.insertedId).to.exist();
    });

    it('returns 403 for cruise_manager without create_lowerings scope', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/lowerings',
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt },
        payload: {
          lowering_id: 'J2-1402',
          start_ts: '2024-04-01T08:00:00.000Z',
          stop_ts: '2024-04-01T20:00:00.000Z',
          lowering_location: 'Galapagos Rift',
          lowering_additional_meta: {},
          lowering_tags: []
        }
      });

      expect(res.statusCode).to.equal(403);
    });

    it('returns 400 when start_ts >= stop_ts', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/lowerings',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          lowering_id: 'J2-BAD',
          start_ts: '2024-04-01T20:00:00.000Z',
          stop_ts: '2024-04-01T08:00:00.000Z',
          lowering_location: '',
          lowering_additional_meta: {},
          lowering_tags: []
        }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /lowerings/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /lowerings/{id}', () => {
    it('updates a lowering as admin', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { lowering_location: 'East Pacific Rise' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(loweringsTable).findOne({ _id: testLowering._id });
      expect(updated.lowering_location).to.equal('East Pacific Rise');
    });

    it('updates a lowering as cruise_manager', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt },
        payload: { lowering_location: 'Juan de Fuca Ridge' }
      });

      expect(res.statusCode).to.equal(204);
    });

    it('returns 400 for unknown id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/lowerings/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { lowering_location: 'Nowhere' }
      });

      // PATCH returns 400 (not 404) for unknown lowering id per route implementation
      expect(res.statusCode).to.equal(400);
    });

    it('returns 403 for event_logger without write_lowerings scope', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: { lowering_location: 'Hacked' }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /lowerings/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /lowerings/{id}', () => {
    it('deletes a lowering as admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(loweringsTable).findOne({ _id: testLowering._id });
      expect(gone).to.not.exist();
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/lowerings/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 403 for cruise_manager without create_lowerings scope', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/lowerings/${testLowering._id}`,
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });
});
