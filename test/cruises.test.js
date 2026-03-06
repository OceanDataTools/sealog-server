'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, cruisesTable } = require('../config/db_constants');

describe('Cruises API', () => {
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

  const testCruise = {
    _id: ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    cruise_id: 'EX-2024-01',
    start_ts: new Date('2024-01-01T00:00:00Z'),
    stop_ts: new Date('2024-06-30T23:59:59Z'),
    cruise_location: 'Pacific Ocean',
    cruise_additional_meta: {
      cruise_name: 'Test Cruise',
      cruise_vessel: 'RV Test',
      cruise_pi: 'Dr. Test'
    },
    cruise_tags: ['test'],
    cruise_hidden: false,
    cruise_access_list: []
  };

  const hiddenCruise = {
    _id: ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    cruise_id: 'EX-2024-02',
    start_ts: new Date('2024-07-01T00:00:00Z'),
    stop_ts: new Date('2024-12-31T23:59:59Z'),
    cruise_location: 'Atlantic Ocean',
    cruise_additional_meta: {
      cruise_name: 'Hidden Cruise',
      cruise_vessel: 'RV Hidden',
      cruise_pi: 'Dr. Hidden'
    },
    cruise_tags: [],
    cruise_hidden: true,
    cruise_access_list: []
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
    await db.collection(cruisesTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, regularUser]);
    await db.collection(cruisesTable).insertMany([testCruise, hiddenCruise]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /cruises
  // ───────────────────────────────────────────────
  describe('GET /cruises', () => {
    it('returns all cruises including hidden for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/cruises',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(2);
    });

    it('excludes hidden cruises for non-admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/cruises',
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].cruise_id).to.equal('EX-2024-01');
    });

    it('returns empty array when no cruises match', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/cruises?cruise_id=NONEXISTENT',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result).to.be.an.array();
      expect(res.result.length).to.equal(0);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/cruises'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /cruises/{id}
  // ───────────────────────────────────────────────
  describe('GET /cruises/{id}', () => {
    it('returns a cruise by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.cruise_id).to.equal('EX-2024-01');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/cruises/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // POST /cruises
  // ───────────────────────────────────────────────
  describe('POST /cruises', () => {
    it('creates a cruise as admin', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/cruises',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          cruise_id: 'EX-2025-01',
          start_ts: '2025-01-01T00:00:00.000Z',
          stop_ts: '2025-06-30T23:59:59.000Z',
          cruise_location: 'Gulf of Mexico',
          cruise_additional_meta: { cruise_name: 'New Cruise' },
          cruise_tags: []
        }
      });

      expect(res.statusCode).to.equal(201);
      expect(res.result.insertedId).to.exist();
    });

    it('returns 403 for cruise_manager without create_cruises scope', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/cruises',
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt },
        payload: {
          cruise_id: 'EX-2025-01',
          start_ts: '2025-01-01T00:00:00.000Z',
          stop_ts: '2025-06-30T23:59:59.000Z',
          cruise_location: 'Gulf of Mexico',
          cruise_additional_meta: { cruise_name: 'New Cruise' },
          cruise_tags: []
        }
      });

      expect(res.statusCode).to.equal(403);
    });

    it('returns 400 when start_ts >= stop_ts', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/cruises',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          cruise_id: 'EX-2025-BAD',
          start_ts: '2025-06-30T00:00:00.000Z',
          stop_ts: '2025-01-01T00:00:00.000Z',
          cruise_location: '',
          cruise_additional_meta: {},
          cruise_tags: []
        }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /cruises/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /cruises/{id}', () => {
    it('updates a cruise as admin', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { cruise_location: 'Indian Ocean' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(cruisesTable).findOne({ _id: testCruise._id });
      expect(updated.cruise_location).to.equal('Indian Ocean');
    });

    it('updates a cruise as cruise_manager', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt },
        payload: { cruise_location: 'Arctic Ocean' }
      });

      expect(res.statusCode).to.equal(204);
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/cruises/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { cruise_location: 'Nowhere' }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 403 for event_logger without write_cruises scope', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + regularJwt },
        payload: { cruise_location: 'Hacked' }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /cruises/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /cruises/{id}', () => {
    it('deletes a cruise as admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(cruisesTable).findOne({ _id: testCruise._id });
      expect(gone).to.not.exist();
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/cruises/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 403 for cruise_manager without create_cruises scope', async () => {
      await db.collection(usersTable).updateOne({ _id: regularUser._id }, { $set: { roles: ['cruise_manager'] } });

      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/cruises/${testCruise._id}`,
        headers: { Authorization: 'Bearer ' + cruiseManagerJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });
});
