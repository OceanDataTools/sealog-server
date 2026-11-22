'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventsTable, eventAuxDataTable, eventTemplatesTable } = require('../config/db_constants');
const { syncVocabAuxData } = require('../lib/vocab_aux_data');

describe('Vocabulary IDs as event aux_data', () => {
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
        event_option_default_value: 'SBE 911plus',
        event_option_values: [],
        event_option_allow_freeform: false,
        event_option_required: false,
        event_option_vocab: { collection: 'L22', terms: [{ value: 'SBE 911plus', notation: 'SDN:L22::TOOL0058' }] }
      },
      {
        event_option_name: 'Action',
        event_option_type: 'dropdown',
        event_option_values: ['InWater', 'OnBottom'],
        event_option_allow_freeform: true,
        event_option_required: true,
        event_option_vocab: {
          collection: 'EL1',
          terms: [{ value: 'InWater', notation: 'SDN:EL1::act16' }, { value: 'OnBottom', notation: 'SDN:EL1::act7' }]
        }
      },
      {
        event_option_name: 'Gear Used',
        event_option_type: 'checkboxes',
        event_option_values: ['Rosette', 'Altimeter'],
        event_option_allow_freeform: false,
        event_option_required: false,
        event_option_vocab: {
          collection: 'L05',
          terms: [{ value: 'Rosette', notation: 'SDN:L05::30' }, { value: 'Altimeter', notation: 'SDN:L05::379' }]
        }
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

  const vocabRecords = (eventId) => db.collection(eventAuxDataTable).find({ event_id: new ObjectId(eventId), data_source: 'vocab' }).toArray();

  const entries = async (eventId) => {

    const records = await vocabRecords(eventId);
    expect(records.length).to.be.below(2);
    return records.length ? records[0].data_array.map((item) => `${item.data_name}=${item.data_value}`) : null;
  };

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(eventsTable).deleteMany({});
    await db.collection(eventAuxDataTable).deleteMany({});
    await db.collection(eventTemplatesTable).deleteMany({});
    await db.collection(usersTable).insertOne(adminUser);
    await db.collection(eventTemplatesTable).insertOne({ ...ctdTemplate });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('records the IDs of the option values when the event is created', async () => {
    const res = await createEvent({
      event_value: 'CTD',
      event_options: [
        { event_option_name: 'Instrument', event_option_value: 'SBE 911plus' },
        { event_option_name: 'Action', event_option_value: 'InWater' },
        { event_option_name: 'Gear Used', event_option_value: 'Rosette;Altimeter' },
        { event_option_name: 'Notes', event_option_value: 'cast 3' }
      ]
    });

    expect(res.statusCode).to.equal(201);

    const [record] = await vocabRecords(res.result.insertedId);
    expect(record.data_array).to.equal([
      { data_name: 'instrument', data_value: 'SDN:L22::TOOL0058', data_uom: 'notation' },
      { data_name: 'action', data_value: 'SDN:EL1::act16', data_uom: 'notation' },
      { data_name: 'gear_used', data_value: 'SDN:L05::30', data_uom: 'notation' },
      { data_name: 'gear_used', data_value: 'SDN:L05::379', data_uom: 'notation' }
    ]);
  });

  it('records static text from the template when the client sends no options', async () => {
    const res = await createEvent({ event_value: 'CTD' });

    expect(await entries(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0058']);
  });

  it('keeps one record in step as options are added and changed', async () => {
    // The vessel client creates the event first, then sends the options
    const res = await createEvent({ event_value: 'CTD' });
    const id = res.result.insertedId;

    expect((await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'InWater' }] })).statusCode).to.equal(204);
    expect(await entries(id)).to.equal(['instrument=SDN:L22::TOOL0058', 'action=SDN:EL1::act16']);

    await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'OnBottom' }] });
    expect(await entries(id)).to.equal(['instrument=SDN:L22::TOOL0058', 'action=SDN:EL1::act7']);
  });

  it('skips values with no term, such as freeform text', async () => {
    const res = await createEvent({
      event_value: 'CTD',
      event_options: [{ event_option_name: 'Action', event_option_value: 'Something else' }]
    });

    expect(await entries(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0058']);
  });

  it('deletes the record when no values map to terms any more', async () => {
    await db.collection(eventTemplatesTable).updateOne({ event_value: 'CTD' }, { $pull: { event_options: { event_option_name: 'Instrument' } } });

    const res = await createEvent({ event_value: 'CTD', event_options: [{ event_option_name: 'Action', event_option_value: 'InWater' }] });
    const id = res.result.insertedId;
    expect(await entries(id)).to.equal(['action=SDN:EL1::act16']);

    await updateEvent(id, { event_options: [{ event_option_name: 'Action', event_option_value: 'Recovered' }] });
    expect(await entries(id)).to.be.null();
  });

  it('rebuilds the record after a timestamp change deletes the aux data', async () => {
    const res = await createEvent({ event_value: 'CTD', event_options: [{ event_option_name: 'Action', event_option_value: 'InWater' }] });
    const id = res.result.insertedId;

    await updateEvent(id, { ts: '2024-01-01T00:00:00.000Z' });

    expect(await entries(id)).to.equal(['instrument=SDN:L22::TOOL0058', 'action=SDN:EL1::act16']);
  });

  it('records nothing for templates without vocabularies', async () => {
    await db.collection(eventTemplatesTable).insertOne({ ...ctdTemplate, event_value: 'PLAIN', event_options: [ctdTemplate.event_options[3]] });

    const res = await createEvent({ event_value: 'PLAIN', event_options: [{ event_option_name: 'Notes', event_option_value: 'x' }] });

    expect(await entries(res.result.insertedId)).to.be.null();
  });

  it('ignores a template whose options the event does not match', async () => {
    const res = await createEvent({
      event_value: 'CTD',
      event_options: [{ event_option_name: 'Depth', event_option_value: '100' }]
    });

    expect(await entries(res.result.insertedId)).to.be.null();
  });

  it('records nothing when templates with the same event_value disagree', async () => {
    const other = JSON.parse(JSON.stringify(ctdTemplate));
    other.event_name = 'CTD (other ship)';
    other.event_options[0].event_option_vocab.terms[0].notation = 'SDN:L22::TOOL0035';
    await db.collection(eventTemplatesTable).insertOne(other);

    const res = await createEvent({ event_value: 'CTD' });

    expect(await entries(res.result.insertedId)).to.be.null();
  });

  it('records the IDs when templates with the same event_value agree', async () => {
    await db.collection(eventTemplatesTable).insertOne({ ...JSON.parse(JSON.stringify(ctdTemplate)), event_name: 'CTD copy' });

    const res = await createEvent({ event_value: 'CTD' });

    expect(await entries(res.result.insertedId)).to.equal(['instrument=SDN:L22::TOOL0058']);
  });

  it('leaves other aux data alone', async () => {
    const res = await createEvent({ event_value: 'CTD' });
    const eventId = new ObjectId(res.result.insertedId);
    await db.collection(eventAuxDataTable).insertOne({ event_id: eventId, data_source: 'vesselPosition', data_array: [{ data_name: 'latitude', data_value: '41.5', data_uom: 'ddeg' }] });

    await updateEvent(res.result.insertedId, { event_options: [{ event_option_name: 'Action', event_option_value: 'OnBottom' }] });

    const sources = (await db.collection(eventAuxDataTable).find({ event_id: eventId }).toArray()).map((record) => record.data_source).sort();
    expect(sources).to.equal(['vesselPosition', 'vocab']);
  });
  it('broadcasts updates and deletes even when new records are not broadcast', async () => {
    const published = [];
    const recorder = { publish: (path, message) => published.push(`${path.split('/').pop()}:${message.data_array ? message.data_array.length : 0}`) };

    await db.collection(eventTemplatesTable).updateOne({ event_value: 'CTD' }, { $pull: { event_options: { event_option_name: 'Instrument' } } });
    const event = { _id: new ObjectId(), event_value: 'CTD', event_options: [{ event_option_name: 'action', event_option_value: 'InWater' }] };

    // An old event: its new record isn't broadcast (THRESHOLD), but later changes are
    await syncVocabAuxData(recorder, db, event, false);
    await syncVocabAuxData(recorder, db, event, false);
    await syncVocabAuxData(recorder, db, { ...event, event_options: [{ event_option_name: 'action', event_option_value: 'OnBottom' }] }, false);
    await syncVocabAuxData(recorder, db, { ...event, event_options: [{ event_option_name: 'action', event_option_value: 'Recovered' }] }, false);

    expect(published).to.equal(['updateEventAuxData:1', 'deleteEventAuxData:1']);

    await syncVocabAuxData(recorder, db, event, true);
    expect(published.pop()).to.equal('newEventAuxData:1');
  });
});
