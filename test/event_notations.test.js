'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventsTable, eventAuxDataTable, eventTemplatesTable } = require('../config/db_constants');
const { vocabulariesTable, vocabularyTermsTable } = require('../lib/vocabularies');

const term = (collection, id, prefLabel) => ({
  collection, id, prefLabel, notation: `SDN:${collection}::${id}`, uri: '', altLabel: '', definition: '', deprecated: false, replacedBy: [], broader: []
});

const terms = [
  term('L22', 'TOOL0058', 'SBE 911plus'),
  term('L22', 'TOOL0035', 'SBE 25'),
  term('EL1', 'act16', 'InWater'),
  term('EL1', 'act7', 'OnBottom'),
  term('L05', '30', 'Rosette'),
  term('L05', '379', 'Altimeter')
];

describe('Vocabulary IDs on event options', () => {
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

  const adminJwt = 'Bearer ' + Jwt.sign({ id: adminUser._id, roles: adminUser.roles, scope: ['admin'] }, SECRET);

  const ctdTemplate = {
    event_name: 'CTD',
    event_value: 'CTD',
    event_free_text_required: false,
    system_template: false,
    template_categories: [],
    event_options: [
      {
        event_option_name: 'Instrument',
        event_option_type: 'static text',
        event_option_default_value: '',
        event_option_values: [],
        event_option_allow_freeform: false,
        event_option_required: false,
        event_option_vocab: { collection: 'L22', terms: ['TOOL0058'] }
      },
      {
        event_option_name: 'Action',
        event_option_type: 'dropdown',
        event_option_values: [],
        event_option_allow_freeform: true,
        event_option_required: true,
        event_option_vocab: { collection: 'EL1' }
      },
      {
        event_option_name: 'Gear Used',
        event_option_type: 'checkboxes',
        event_option_values: [],
        event_option_allow_freeform: false,
        event_option_required: false,
        event_option_vocab: { collection: 'L05', terms: ['30', '379'] }
      },
      {
        event_option_name: 'Notes',
        event_option_type: 'text',
        event_option_values: [],
        event_option_allow_freeform: true,
        event_option_required: false
      }
    ]
  };

  const createEvent = (payload) => server.inject({
    method: 'POST',
    url: '/sealog-server/api/v1/events',
    headers: { Authorization: adminJwt },
    payload
  });

  const updateEvent = (id, payload) => server.inject({
    method: 'PATCH',
    url: `/sealog-server/api/v1/events/${id}`,
    headers: { Authorization: adminJwt },
    payload
  });

  const storedOptions = async (id) => (await db.collection(eventsTable).findOne({ _id: new ObjectId(id) })).event_options;

  // name=notation for the options that have one
  const notations = async (id) => (await storedOptions(id)).filter((option) => option.event_option_notation).map((option) => `${option.event_option_name}=${option.event_option_notation}`);

  const ctdOptions = [
    { event_option_name: 'Instrument', event_option_value: 'SBE 911plus' },
    { event_option_name: 'Action', event_option_value: 'InWater' },
    { event_option_name: 'Gear Used', event_option_value: 'Rosette;Altimeter' },
    { event_option_name: 'Notes', event_option_value: 'cast 3' }
  ];

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(eventsTable).deleteMany({});
    await db.collection(eventAuxDataTable).deleteMany({});
    await db.collection(eventTemplatesTable).deleteMany({});
    await db.collection(vocabulariesTable).deleteMany({});
    await db.collection(vocabularyTermsTable).deleteMany({});
    await db.collection(vocabulariesTable).insertMany(['L22', 'EL1', 'L05'].map((collection) => ({ collection, title: collection, source: 'nvs' })));
    await db.collection(vocabularyTermsTable).insertMany(terms.map((t) => ({ ...t })));
    await db.collection(usersTable).insertOne(adminUser);
    await db.collection(eventTemplatesTable).insertOne({ ...ctdTemplate });
  });

  afterEach(async () => {
    await server.stop();
  });

  const getEvent = async (id, format = 'json') => {

    const res = await server.inject({ method: 'GET', url: `/sealog-server/api/v1/events/${id}?format=${format}`, headers: { Authorization: adminJwt } });
    expect(res.statusCode).to.equal(200);
    return res.result;
  };

  it('maps the option values to term IDs when the event is created', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: ctdOptions });
    expect(res.statusCode).to.equal(201);

    // Checkbox IDs are joined with ';' like their values; free text has none
    expect((await getEvent(res.result.insertedId)).event_options).to.equal([
      { event_option_name: 'instrument', event_option_value: 'SBE 911plus', event_option_notation: 'SDN:L22::TOOL0058' },
      { event_option_name: 'action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' },
      { event_option_name: 'gear_used', event_option_value: 'Rosette;Altimeter', event_option_notation: 'SDN:L05::30;SDN:L05::379' },
      { event_option_name: 'notes', event_option_value: 'cast 3' }
    ]);
  });

  it('writes no vocab aux_data record', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: ctdOptions });

    expect(await db.collection(eventAuxDataTable).countDocuments({ event_id: new ObjectId(res.result.insertedId) })).to.equal(0);
  });

  it('maps the options sent in a later update', async () => {
    // The vessel client creates the event first, then sends the options
    const res = await createEvent({ event_value: 'CTD' });
    const id = res.result.insertedId;
    expect(await storedOptions(id)).to.equal([]);

    expect((await updateEvent(id, { event_options: [ctdOptions[0], { event_option_name: 'Action', event_option_value: 'InWater' }] })).statusCode).to.equal(204);
    expect(await notations(id)).to.equal(['instrument=SDN:L22::TOOL0058', 'action=SDN:EL1::act16']);

    await updateEvent(id, { event_options: [ctdOptions[0], { event_option_name: 'Action', event_option_value: 'OnBottom' }] });
    expect(await notations(id)).to.equal(['instrument=SDN:L22::TOOL0058', 'action=SDN:EL1::act7']);
  });

  it('skips values with no term, such as freeform text', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: [ctdOptions[0], { event_option_name: 'Action', event_option_value: 'Something else' }] });

    expect(await notations(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0058']);
  });

  it('maps nothing for templates without vocabularies', async () => {
    await db.collection(eventTemplatesTable).insertOne({ ...ctdTemplate, event_value: 'PLAIN', event_options: [ctdTemplate.event_options[3]] });

    const res = await createEvent({ event_value: 'PLAIN', event_options: [{ event_option_name: 'Notes', event_option_value: 'x' }] });

    expect(await notations(res.result.insertedId)).to.equal([]);
  });

  it('ignores a template whose options the event does not match', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: [ctdOptions[1], { event_option_name: 'Depth', event_option_value: '100' }] });

    expect(await notations(res.result.insertedId)).to.equal([]);
  });

  it('maps nothing when templates with the same event_value disagree', async () => {
    const other = JSON.parse(JSON.stringify(ctdTemplate));
    // Its Instrument takes the same label from another vocabulary
    other.event_name = 'CTD (other ship)';
    other.event_options[0].event_option_vocab = { collection: 'L05', terms: ['SBE'] };
    await db.collection(vocabularyTermsTable).insertOne(term('L05', 'SBE', 'SBE 911plus'));
    await db.collection(eventTemplatesTable).insertOne(other);

    const res = await createEvent({ event_value: 'CTD', event_options: [{ event_option_name: 'Instrument', event_option_value: 'SBE 911plus' }] });

    expect(await notations(res.result.insertedId)).to.equal([]);
  });

  it('maps the IDs when templates with the same event_value agree', async () => {
    await db.collection(eventTemplatesTable).insertOne({ ...JSON.parse(JSON.stringify(ctdTemplate)), event_name: 'CTD copy' });

    const res = await createEvent({ event_value: 'CTD', event_options: [ctdOptions[0]] });

    expect(await notations(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0058']);
  });

  it('keeps the ID of an unchanged value whose term label changed', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: [ctdOptions[1]] });
    const id = res.result.insertedId;

    // A refresh renames the term; the client sends the event back unchanged
    await db.collection(vocabularyTermsTable).updateOne({ collection: 'EL1', id: 'act16' }, { $set: { prefLabel: 'In water' } });
    await updateEvent(id, { event_options: [ctdOptions[1]], event_free_text: 'edited' });
    expect(await notations(id)).to.equal(['action=SDN:EL1::act16']);

    // Changing the value to one with no term drops the old ID
    await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'Something else' }] });
    expect(await notations(id)).to.equal([]);
  });

  it('maps values against the vocabulary as it is now', async () => {
    await db.collection(vocabulariesTable).updateOne({ collection: 'EL1' }, { $set: { visibility: { mode: 'hide_listed', terms: ['act7'] } } });

    const res = await createEvent({ event_value: 'CTD', event_options: [{ event_option_name: 'Action', event_option_value: 'OnBottom' }] });

    expect(await notations(res.result.insertedId)).to.equal([]);
  });

  it('keeps the IDs through a timestamp change', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: [ctdOptions[1]] });
    const id = res.result.insertedId;

    await updateEvent(id, { ts: '2024-01-01T00:00:00.000Z' });

    expect(await notations(id)).to.equal(['action=SDN:EL1::act16']);
  });

  describe('event_option_notation sent by the client', () => {
    it('stores and returns the notations sent; an empty one means none', async () => {
      const res = await createEvent({
        event_value: 'CTD',
        event_options: [
          { event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' },
          { event_option_name: 'Notes', event_option_value: 'cast 3', event_option_notation: '' }
        ]
      });
      expect(res.statusCode).to.equal(201);

      expect((await getEvent(res.result.insertedId)).event_options).to.equal([
        { event_option_name: 'action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' },
        { event_option_name: 'notes', event_option_value: 'cast 3' }
      ]);
    });

    it('keeps the notation sent rather than the one the label maps to', async () => {
      // The value was picked before the term was relabelled
      const res = await createEvent({
        event_value: 'CTD',
        event_options: [{ event_option_name: 'Action', event_option_value: 'In water', event_option_notation: 'SDN:EL1::act16' }, ctdOptions[0]]
      });

      expect(await notations(res.result.insertedId)).to.equal(['action=SDN:EL1::act16', 'instrument=SDN:L22::TOOL0058']);
    });

    it('keeps the notations sent even when templates with the same event_value disagree', async () => {
      const other = JSON.parse(JSON.stringify(ctdTemplate));
      other.event_name = 'CTD (other ship)';
      other.event_options[0].event_option_vocab.terms = ['TOOL0035'];
      await db.collection(eventTemplatesTable).insertOne(other);

      const res = await createEvent({
        event_value: 'CTD',
        event_options: [
          { event_option_name: 'Instrument', event_option_value: 'SBE 25', event_option_notation: 'SDN:L22::TOOL0035' },
          { event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' }
        ]
      });

      expect(await notations(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0035', 'action=SDN:EL1::act16']);
    });

    it('keeps the notation of an unchanged value sent without one, and remaps a changed value', async () => {
      const res = await createEvent({
        event_value: 'CTD',
        event_options: [{ event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' }]
      });
      const id = res.result.insertedId;

      // A client that doesn't know about notations sends the options back
      await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'InWater' }], event_free_text: 'edited' });
      expect(await storedOptions(id)).to.equal([{ event_option_name: 'action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' }]);

      await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'OnBottom' }] });
      expect(await storedOptions(id)).to.equal([{ event_option_name: 'action', event_option_value: 'OnBottom', event_option_notation: 'SDN:EL1::act7' }]);
    });

    it('removes the notation when an empty one is sent, without remapping it', async () => {
      const res = await createEvent({
        event_value: 'CTD',
        event_options: [{ event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' }]
      });
      const id = res.result.insertedId;

      await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: '' }] });
      expect(await storedOptions(id)).to.equal([{ event_option_name: 'action', event_option_value: 'InWater' }]);
    });

    it('exports notations as CSV columns next to their values', async () => {
      const res = await createEvent({
        event_value: 'CTD',
        event_options: [
          { event_option_name: 'Action', event_option_value: 'InWater', event_option_notation: 'SDN:EL1::act16' },
          { event_option_name: 'Notes', event_option_value: 'cast 3' }
        ]
      });

      const [header, row] = (await getEvent(res.result.insertedId, 'csv')).trim().split('\n');
      const columns = header.split(',').map((column) => column.replace(/"/g, ''));
      expect(columns.slice(5, 8)).to.equal(['event_option.action', 'event_option.action.notation', 'event_option.notes']);
      expect(row).to.contain('SDN:EL1::act16');
    });
  });
});
