'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventTemplatesTable } = require('../config/db_constants');
const { vocabulariesTable, vocabularyTermsTable } = require('../lib/vocabularies');
const { publishTemplatesUsing } = require('../lib/template_vocab');

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

    it('clears the button color back to the default with an empty string', async () => {
      const patch = (event_button_color) => server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { event_button_color }
      });

      expect((await patch('success')).statusCode).to.equal(204);
      expect((await patch('')).statusCode).to.equal(204);

      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_templates/${normalTemplate._id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });
      expect(res.statusCode).to.equal(200);
      expect(res.result.event_button_color).to.equal('');
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
  // ───────────────────────────────────────────────
  // event_option_vocab
  // ───────────────────────────────────────────────
  describe('event_option_vocab', () => {
    const term = (collection, id, prefLabel, extra = {}) => ({
      collection, id, prefLabel, notation: `SDN:${collection}::${id}`, uri: '', altLabel: '', definition: '', deprecated: false, replacedBy: [], broader: [], ...extra
    });

    beforeEach(async () => {
      await db.collection(vocabulariesTable).deleteMany({});
      await db.collection(vocabularyTermsTable).deleteMany({});
      await db.collection(vocabulariesTable).insertMany([
        { collection: 'EL1', title: 'Platform Event Actions', source: 'nvs' },
        { collection: 'L22', title: 'SeaVoX Device Catalogue', source: 'nvs', visibility: { mode: 'hide_listed', terms: ['TOOL0099'] } }
      ]);
      await db.collection(vocabularyTermsTable).insertMany([
        term('EL1', 'act16', 'InWater'),
        term('EL1', 'act7', 'OnBottom'),
        term('EL1', 'act1', 'Start', { deprecated: true }),
        term('L22', 'TOOL0058', 'SBE 911plus CTD'),
        term('L22', 'TOOL0035', 'SBE 25 CTD'),
        term('L22', 'TOOL0099', 'Hidden CTD'),
        term('L22', 'TOOL0100', 'Twin'),
        term('L22', 'TOOL0101', 'Twin')
      ]);
    });

    const option = (fields) => ({
      event_option_name: 'Action',
      event_option_type: 'dropdown',
      event_option_values: [],
      event_option_allow_freeform: false,
      event_option_required: true,
      ...fields
    });

    const createTemplate = (event_options) => {

      return server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/event_templates',
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: {
          event_name: 'Vocab Template',
          event_value: 'VOCAB',
          event_free_text_required: false,
          system_template: false,
          event_options
        }
      });
    };

    const getTemplate = async (id) => {

      const res = await server.inject({
        method: 'GET',
        url: `/sealog-server/api/v1/event_templates/${id}`,
        headers: { Authorization: 'Bearer ' + adminJwt }
      });
      expect(res.statusCode).to.equal(200);
      return res.result;
    };

    it('fills in the values of every shown, current term', async () => {
      const res = await createTemplate([option({ event_option_vocab: { collection: 'EL1' } })]);
      expect(res.statusCode).to.equal(201);

      const template = await getTemplate(res.result.insertedId);
      expect(template.event_options[0].event_option_values).to.equal(['InWater', 'OnBottom']);
      expect(template.event_options[0].event_option_vocab).to.equal({ collection: 'EL1' });
    });

    it('keeps only the listed terms, in order, and leaves out hidden ones', async () => {
      const res = await createTemplate([option({ event_option_name: 'Instrument', event_option_vocab: { collection: 'L22', terms: ['TOOL0035', 'TOOL0099', 'TOOL0058'] } })]);

      const template = await getTemplate(res.result.insertedId);
      expect(template.event_options[0].event_option_values).to.equal(['SBE 25 CTD', 'SBE 911plus CTD']);
    });

    it('appends the ID to duplicate labels', async () => {
      const res = await createTemplate([option({ event_option_name: 'Instrument', event_option_vocab: { collection: 'L22', terms: ['TOOL0100', 'TOOL0101', 'TOOL0058'] } })]);

      const template = await getTemplate(res.result.insertedId);
      expect(template.event_options[0].event_option_values).to.equal(['Twin (TOOL0100)', 'Twin (TOOL0101)', 'SBE 911plus CTD']);
    });

    it('ignores and does not store the values sent for the option', async () => {
      const res = await createTemplate([option({ event_option_values: ['Anything'], event_option_vocab: { collection: 'EL1', terms: ['act16'] } })]);

      const stored = await db.collection(eventTemplatesTable).findOne({ _id: res.result.insertedId });
      expect(stored.event_options[0].event_option_values).to.equal([]);
      expect((await getTemplate(res.result.insertedId)).event_options[0].event_option_values).to.equal(['InWater']);
    });

    it('follows the vocabulary: hiding and deprecating terms drops them', async () => {
      const res = await createTemplate([option({ event_option_vocab: { collection: 'EL1' } })]);

      await db.collection(vocabulariesTable).updateOne({ collection: 'EL1' }, { $set: { visibility: { mode: 'show_only_listed', terms: ['act16', 'act7'] } } });
      await db.collection(vocabularyTermsTable).updateOne({ collection: 'EL1', id: 'act7' }, { $set: { deprecated: true } });

      expect((await getTemplate(res.result.insertedId)).event_options[0].event_option_values).to.equal(['InWater']);
    });

    it('fills static text with its one term', async () => {
      const res = await createTemplate([option({ event_option_name: 'Instrument', event_option_type: 'static text', event_option_default_value: 'x', event_option_vocab: { collection: 'L22', terms: ['TOOL0058'] } })]);
      expect(res.statusCode).to.equal(201);

      const template = await getTemplate(res.result.insertedId);
      expect(template.event_options[0]).to.include({ event_option_values: [], event_option_default_value: 'SBE 911plus CTD' });
    });

    it('keeps a default that is still offered and clears one that is not', async () => {
      const res = await createTemplate([
        option({ event_option_default_value: 'OnBottom', event_option_vocab: { collection: 'EL1' } }),
        option({ event_option_name: 'Gear', event_option_type: 'checkboxes', event_option_default_value: 'InWater, Start, OnBottom', event_option_vocab: { collection: 'EL1' } })
      ]);

      let template = await getTemplate(res.result.insertedId);
      expect(template.event_options.map((o) => o.event_option_default_value)).to.equal(['OnBottom', 'InWater, OnBottom']);

      await db.collection(vocabularyTermsTable).updateOne({ collection: 'EL1', id: 'act7' }, { $set: { deprecated: true } });
      template = await getTemplate(res.result.insertedId);
      expect(template.event_options[0].event_option_default_value).to.equal('');
    });

    it('returns the notation of each value in the same order', async () => {
      const res = await createTemplate([
        option({ event_option_vocab: { collection: 'L22' } }),
        option({ event_option_name: 'Instrument', event_option_type: 'static text', event_option_vocab: { collection: 'L22', terms: ['TOOL0058'] } }),
        option({ event_option_name: 'Notes', event_option_type: 'text', event_option_values: [] })
      ]);

      const [vocabOption, staticOption, plainOption] = (await getTemplate(res.result.insertedId)).event_options;
      expect(vocabOption.event_option_values).to.equal(['SBE 25 CTD', 'SBE 911plus CTD', 'Twin (TOOL0100)', 'Twin (TOOL0101)']);
      expect(vocabOption.event_option_notations).to.equal(['SDN:L22::TOOL0035', 'SDN:L22::TOOL0058', 'SDN:L22::TOOL0100', 'SDN:L22::TOOL0101']);
      expect(staticOption.event_option_notations).to.equal(['SDN:L22::TOOL0058']);
      expect(plainOption.event_option_notations).to.not.exist();
    });

    it('accepts a template sent back with its notations and does not store them', async () => {
      const res = await createTemplate([option({ event_option_vocab: { collection: 'EL1' } })]);
      const template = await getTemplate(res.result.insertedId);

      const update = await server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_templates/${res.result.insertedId}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { event_options: template.event_options }
      });
      expect(update.statusCode).to.equal(204);

      const stored = await db.collection(eventTemplatesTable).findOne({ _id: new ObjectId(res.result.insertedId) });
      expect(stored.event_options[0].event_option_notations).to.not.exist();
      expect((await getTemplate(res.result.insertedId)).event_options[0].event_option_notations).to.equal(['SDN:EL1::act16', 'SDN:EL1::act7']);
    });

    it('fills in values in the template list too', async () => {
      await createTemplate([option({ event_option_vocab: { collection: 'EL1', terms: ['act7'] } })]);

      const res = await server.inject({ method: 'GET', url: '/sealog-server/api/v1/event_templates', headers: { Authorization: 'Bearer ' + adminJwt } });
      const template = res.result.find((t) => t.event_value === 'VOCAB');
      expect(template.event_options[0].event_option_values).to.equal(['OnBottom']);
    });

    it('still accepts options without a vocabulary', async () => {
      const res = await createTemplate([option({ event_option_values: ['A', 'B'] })]);
      expect(res.statusCode).to.equal(201);
      expect((await getTemplate(res.result.insertedId)).event_options[0].event_option_values).to.equal(['A', 'B']);
    });

    it('rejects unknown vocabularies and terms', async () => {
      let res = await createTemplate([option({ event_option_vocab: { collection: 'P01' } })]);
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.match(/takes its values from vocabulary P01, which isn't installed on this server$/);

      res = await createTemplate([option({ event_option_vocab: { collection: 'EL1', terms: ['act16', 'act99'] } })]);
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.match(/term act99 isn't in vocabulary EL1 on this server$/);

      res = await createTemplate([option({ event_option_vocab: { collection: 'EL1', terms: ['act98', 'act99'] } })]);
      expect(res.result.message).to.match(/terms act98, act99 aren't in vocabulary EL1 on this server$/);
    });

    it('rejects the old copy format, empty and repeated term lists', async () => {
      for (const terms of [[{ value: 'InWater', notation: 'SDN:EL1::act16' }], [], ['act16', 'act16']]) {
        const res = await createTemplate([option({ event_option_vocab: { collection: 'EL1', terms } })]);
        expect(res.statusCode).to.equal(400);
      }
    });

    it('requires exactly one term for static text', async () => {
      for (const vocab of [{ collection: 'L22' }, { collection: 'L22', terms: ['TOOL0058', 'TOOL0035'] }]) {
        const res = await createTemplate([option({ event_option_type: 'static text', event_option_vocab: vocab })]);
        expect(res.statusCode).to.equal(400);
        expect(res.result.message).to.contain('exactly one');
      }
    });

    it('rejects a vocabulary on a text option', async () => {
      const res = await createTemplate([option({ event_option_type: 'text', event_option_vocab: { collection: 'EL1' } })]);
      expect(res.statusCode).to.equal(400);
    });

    it('checks references on PATCH', async () => {
      const res = await createTemplate([option({ event_option_vocab: { collection: 'EL1' } })]);
      const patch = (event_options) => server.inject({
        method: 'PATCH',
        url: `/sealog-server/api/v1/event_templates/${res.result.insertedId}`,
        headers: { Authorization: 'Bearer ' + adminJwt },
        payload: { event_options }
      });

      expect((await patch([option({ event_option_vocab: { collection: 'EL1', terms: ['nope'] } })])).statusCode).to.equal(400);
      expect((await patch([option({ event_option_values: ['x'], event_option_vocab: { collection: 'EL1', terms: ['act7'] } })])).statusCode).to.equal(204);

      const stored = await db.collection(eventTemplatesTable).findOne({ _id: res.result.insertedId });
      expect(stored.event_options[0]).to.include({ event_option_values: [], event_option_vocab: { collection: 'EL1', terms: ['act7'] } });
    });

    it('re-sends the templates using a vocabulary with their new values', async () => {
      await createTemplate([option({ event_option_vocab: { collection: 'EL1' } })]);
      await createTemplate([option({ event_option_vocab: { collection: 'L22', terms: ['TOOL0058'] } })]);

      const published = [];
      await publishTemplatesUsing({ publish: (path, message) => published.push([path, message]) }, db, 'EL1');

      expect(published.length).to.equal(1);
      expect(published[0][0]).to.equal('/ws/status/updateEventTemplates');
      expect(published[0][1].id).to.exist();
      expect(published[0][1].disabled).to.not.exist();
      expect(published[0][1].event_options[0].event_option_values).to.equal(['InWater', 'OnBottom']);
    });
  });
});
