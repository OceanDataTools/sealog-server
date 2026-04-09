'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventTemplatesTable } = require('../config/db_constants');

describe('Event Templates API', () => {
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

  const powerLoggerUser = {
    _id: new ObjectId('000000000000000000000003'),
    username: 'powerlogger',
    fullname: 'Power Logger',
    email: 'powerlogger@example.com',
    password: 'hashed',
    last_login: new Date(),
    roles: ['power_logger'],
    system_user: false,
    disabled: false,
    loginToken: 'powerloggertoken12345x'
  };

  const normalTemplate = {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    event_name: 'Normal Template',
    event_value: 'NORMAL',
    event_free_text_required: false,
    system_template: false,
    template_categories: [],
    event_options: [],
    disabled: false,
    admin_only: false
  };

  const adminOnlyTemplate = {
    _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    event_name: 'Admin Template',
    event_value: 'ADMIN_ONLY',
    event_free_text_required: false,
    system_template: false,
    template_categories: [],
    event_options: [],
    disabled: false,
    admin_only: true
  };

  const disabledTemplate = {
    _id: new ObjectId('cccccccccccccccccccccccc'),
    event_name: 'Disabled Template',
    event_value: 'DISABLED',
    event_free_text_required: false,
    system_template: false,
    template_categories: [],
    event_options: [],
    disabled: true,
    admin_only: false
  };

  const adminJwt = Jwt.sign(
    { id: adminUser._id, roles: adminUser.roles, scope: ['admin'] },
    SECRET
  );

  const loggerJwt = Jwt.sign(
    { id: loggerUser._id, roles: loggerUser.roles, scope: ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings'] },
    SECRET
  );

  const powerLoggerJwt = Jwt.sign(
    { id: powerLoggerUser._id, roles: powerLoggerUser.roles, scope: ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings', 'read_admin_templates'] },
    SECRET
  );

  const templateManagerJwt = Jwt.sign(
    { id: loggerUser._id, roles: ['template_manager'], scope: ['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'read_lowerings'] },
    SECRET
  );

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(eventTemplatesTable).deleteMany({});
    await db.collection(usersTable).insertMany([adminUser, loggerUser, powerLoggerUser]);
    await db.collection(eventTemplatesTable).insertMany([normalTemplate, adminOnlyTemplate, disabledTemplate]);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ───────────────────────────────────────────────
  // GET /event_templates
  // ───────────────────────────────────────────────
  describe('GET /event_templates', () => {
    it('returns all templates including admin_only and disabled for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(3);
    });

    it('returns only non-admin, non-disabled templates for event_logger', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(1);
      expect(res.result[0].event_value).to.equal('NORMAL');
    });

    it('does not return admin_only templates for power_logger', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + powerLoggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      const values = res.result.map((t) => t.event_value);
      expect(values).to.not.include('ADMIN_ONLY');
      expect(values).to.include('NORMAL');
    });

    it('includes disabled field in response for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result[0].disabled).to.exist();
    });

    it('omits disabled field in response for non-admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result[0].disabled).to.not.exist();
    });

    it('returns 401 without JWT', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates'
      });

      expect(res.statusCode).to.equal(401);
    });
  });

  // ───────────────────────────────────────────────
  // GET /event_templates/{id}
  // ───────────────────────────────────────────────
  describe('GET /event_templates/{id}', () => {
    it('returns a template by id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.event_value).to.equal('NORMAL');
    });

    it('returns 404 for admin_only template when requested by non-admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_templates/${adminOnlyTemplate._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });

    it('returns admin_only template for admin', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_templates/${adminOnlyTemplate._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.event_value).to.equal('ADMIN_ONLY');
    });

    it('returns 404 for unknown id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/sealog-server/api/v1/event_templates/000000000000000000000099',
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(404);
    });
  });

  // ───────────────────────────────────────────────
  // POST /event_templates
  // ───────────────────────────────────────────────
  describe('POST /event_templates', () => {
    it('creates a template with write_event_templates scope', async () => {
      await db.collection(usersTable).updateOne({ _id: loggerUser._id }, { $set: { roles: ['template_manager'] } });

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + templateManagerJwt },
        payload: {
          event_name: 'New Template',
          event_value: 'NEW',
          event_free_text_required: false,
          system_template: false
        }
      });

      expect(res.statusCode).to.equal(201);
    });

    it('returns 403 for event_logger without write_event_templates scope', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: {
          event_name: 'New Template',
          event_value: 'NEW',
          event_free_text_required: false,
          system_template: false
        }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // PATCH /event_templates/{id}
  // ───────────────────────────────────────────────
  describe('PATCH /event_templates/{id}', () => {
    it('updates a template as admin', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { event_name: 'Updated Name' }
      });

      expect(res.statusCode).to.equal(204);
      const updated = await db.collection(eventTemplatesTable).findOne({ _id: normalTemplate._id });
      expect(updated.event_name).to.equal('Updated Name');
    });

    it('returns 403 for event_logger', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt },
        payload: { event_name: 'Hacked' }
      });

      expect(res.statusCode).to.equal(403);
    });
  });

  // ───────────────────────────────────────────────
  // DELETE /event_templates/{id}
  // ───────────────────────────────────────────────
  describe('DELETE /event_templates/{id}', () => {
    it('deletes a template as admin', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });

      expect(res.statusCode).to.equal(204);
      const gone = await db.collection(eventTemplatesTable).findOne({ _id: normalTemplate._id });
      expect(gone).to.not.exist();
    });

    it('returns 403 for event_logger', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + loggerJwt }
      });

      expect(res.statusCode).to.equal(403);
    });
  });
});
