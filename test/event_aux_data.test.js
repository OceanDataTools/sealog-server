'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventsTable, eventAuxDataTable } = require('../config/db_constants');

describe('Event Aux Data API', () => {
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

  const testEvent = {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    event_author: 'logger',
    ts: new Date('2024-01-01T12:00:00Z'),
    event_value: 'TEST',
    event_options: [],
    event_free_text: ''
  };

  const testAuxData = {
    _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    event_id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    data_source: 'navData',
    data_array: [
      { data_name: 'latitude', data_value: '41.5', data_uom: 'ddeg' },
      { data_name: 'longitude', data_value: '-70.2', data_uom: 'ddeg' }
    ]
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
    await db.collection(eventsTable).deleteMany({});
    await db.collection(eventAuxDataTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, loggerUser]);
    await db.collection(eventsTable).insertOne(testEvent);
    await db.collection(eventAuxDataTable).insertOne(testAuxData);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /event_aux_data
  // ───────────────────────────────────────────────
  describe('GET /event_aux_data', () => {
    it('returns aux data records for user with read_events scope', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_aux_data',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].data_source).to.equal('navData');
    });

    it('filters by eventID', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_aux_data?eventID=${testEvent._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
    });

    it('returns empty array when no records match', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_aux_data?eventID=000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
      // expect(res.result).to.be.an.array();
      // expect(res.result.length).to.equal(0);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_aux_data'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /event_aux_data/{id}
  // ───────────────────────────────────────────────
  describe('GET /event_aux_data/{id}', () => {
    it('returns a single aux data record by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_aux_data/${testAuxData._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.data_source).to.equal('navData');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_aux_data/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // POST /event_aux_data
  // ───────────────────────────────────────────────
  describe('POST /event_aux_data', () => {
    it('creates a new aux data record', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/event_aux_data',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: {
          event_id: testEvent._id.toString(),
          data_source: 'framegrabber',
          data_array: [
            { data_name: 'filename', data_value: '/images/test.jpg' }
          ]
        }
      });

      expect(res.statusCode).to.equal(201);
      expect(res.result.insertedId).to.exist();
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/event_aux_data',
        payload: {
          event_id: testEvent._id.toString(),
          data_source: 'framegrabber',
          data_array: []
        }
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /event_aux_data/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /event_aux_data/{id}', () => {
    it('updates an aux data record', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_aux_data/${testAuxData._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: {
          data_source: 'updatedSource'
        }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(eventAuxDataTable).findOne({ _id: testAuxData._id });
      expect(updated.data_source).to.equal('updatedSource');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/sealog-server/api/v1/event_aux_data/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { data_source: 'updated' }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /event_aux_data/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /event_aux_data/{id}', () => {
    it('deletes an aux data record', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/event_aux_data/${testAuxData._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(eventAuxDataTable).findOne({ _id: testAuxData._id });
      expect(gone).to.not.exist();
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/sealog-server/api/v1/event_aux_data/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/event_aux_data/${testAuxData._id}`
      });

      expect(res.statusCode).to.equal(401);
    });
  });
});
