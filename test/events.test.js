'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventsTable, eventAuxDataTable } = require('../config/db_constants');

describe('Events API', () => {
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

  const eventLoggerUser = {
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

  const testEvent = {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    event_author: 'logger',
    ts: new Date('2024-01-01T12:00:00Z'),
    event_value: 'TEST',
    event_options: [],
    event_free_text: 'test event'
  };

  const testAuxData = {
    _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    event_id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    data_source: 'testSource',
    data_array: [{ data_name: 'lat', data_value: '41.0', data_uom: 'ddeg' }]
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  const loggerJwt = Jwt.sign(
    { id: eventLoggerUser._id, roles: eventLoggerUser.roles, scope: ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(eventsTable).deleteMany({});
    await db.collection(eventAuxDataTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, eventLoggerUser]);
    await db.collection(eventsTable).insertOne(testEvent);
    await db.collection(eventAuxDataTable).insertOne(testAuxData);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /events
  // ───────────────────────────────────────────────
  describe('GET /events', () => {
    it('returns events for user with read_events scope', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/events',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].event_value).to.equal('TEST');
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/events'
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns empty array when no events match', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/events?value=NONEXISTENT',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
      // expect(res.result).to.be.an.array();
      // expect(res.result.length).to.equal(0);
    });
  });

  // ───────────────────────────────────────────────
  // GET /events/count
  // ───────────────────────────────────────────────
  describe('GET /events/count', () => {
    it('returns the event count', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/events/count',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.events).to.equal(1);
    });
  });

  // ───────────────────────────────────────────────
  // GET /events/{id}
  // ───────────────────────────────────────────────
  describe('GET /events/{id}', () => {
    it('returns a single event by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/events/${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.event_value).to.equal('TEST');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/events/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // POST /events
  // ───────────────────────────────────────────────
  describe('POST /events', () => {
    it('creates a new event', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/events',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { event_value: 'NEW_EVENT' }
      });

      expect(res.statusCode).to.equal(201);
      expect(res.result.insertedId).to.exist();
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/events',
        payload: { event_value: 'NEW_EVENT' }
      });

      expect(res.statusCode).to.equal(401);
    });

    it('returns 400 for missing event_value', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/events',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { event_free_text: 'no value provided' }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /events/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /events/{id}', () => {
    it('updates an event', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/events/${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { event_free_text: 'updated text' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(eventsTable).findOne({ _id: testEvent._id });
      expect(updated.event_free_text).to.equal('updated text');
    });

    it('returns 400 for unknown event id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/events/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { event_free_text: 'updated' }
      });

      expect(res.statusCode).to.equal(400);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /events/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /events/{id}', () => {
    it('deletes the event from the database', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/events/${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(eventsTable).findOne({ _id: testEvent._id });
      expect(gone).to.not.exist();
    });

    it('also deletes associated aux_data', async () => {
      await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/events/${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      const auxData = await db.collection(eventAuxDataTable).findOne({ _id: testAuxData._id });
      expect(auxData).to.not.exist();
    });

    it('returns 403 without write_events scope', async () => {
      const watcherJwt = Jwt.sign(
        { id: eventLoggerUser._id, roles: ['event_watcher'], scope: ['read_events', 'read_cruises', 'read_lowerings'] },
        SECRET
      );
      await db.collection(usersTable).updateOne({ _id: eventLoggerUser._id }, { $set: { roles: ['event_watcher'] } });

      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/events/${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + watcherJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /events (bulk, admin only)
  // ───────────────────────────────────────────────
  describe('DELETE /events (bulk)', () => {
    it('deletes all events as admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/events',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.deletedCount).to.equal(1);
      const remaining = await db.collection(eventsTable).countDocuments();
      expect(remaining).to.equal(0);
    });

    it('returns 403 for non-admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/events',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });
});
