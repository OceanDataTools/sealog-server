'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventsTable, eventTemplatesTable, cruisesTable, loweringsTable } = require('../config/db_constants');
const { formatId, parseFormat, parseId, sequenceCountersTable, sequencesTable } = require('../lib/sequences');
const { loadSeedBundle } = require('../lib/vocabularies');
const DemoSequences = require('../demo/demo_sequences.json');
const DemoVesselTemplates = require('../demo/FKt230303_eventTemplates.json');

describe('ID sequences', () => {
  let server;
  let db;

  const user = (n, username, roles) => ({
    _id: new ObjectId(`00000000000000000000000${n}`),
    username,
    fullname: username,
    email: `${username}@example.com`,
    password: 'hashed',
    last_login: new Date(),
    roles,
    system_user: false,
    disabled: false,
    loginToken: `${username}token1234567890123`.slice(0, 21)
  });

  const users = [user(1, 'admin', ['admin']), user(2, 'logger', ['event_logger'])];
  const jwt = (index, scope) => 'Bearer ' + Jwt.sign({ id: users[index]._id, roles: users[index].roles, scope }, SECRET);
  const adminJwt = jwt(0, ['admin']);
  const loggerJwt = jwt(1, ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings']);

  const request = (method, url, token, payload) => server.inject({
    method,
    url: `/sealog-server/api/v1${url}`,
    headers: { Authorization: token },
    payload
  });

  const sampleId = { name: 'sample_id', format: '{lowering_id}-S{n:03}', scope: 'lowering' };
  const inDive1 = '2026-01-10T12:00:00.000Z';
  const inDive2 = '2026-01-20T12:00:00.000Z';
  const onDeck = '2026-01-15T12:00:00.000Z';

  const template = (sequence = 'sample_id', event_value = 'SAMPLE') => ({
    event_name: 'Sample',
    event_value,
    event_free_text_required: false,
    system_template: false,
    template_categories: [],
    event_options: [
      { event_option_name: 'Sample ID', event_option_type: 'sequence', event_option_sequence: sequence, event_option_values: [], event_option_default_value: '', event_option_allow_freeform: false, event_option_required: false },
      { event_option_name: 'Notes', event_option_type: 'text', event_option_values: [], event_option_allow_freeform: false, event_option_required: false }
    ]
  });

  const createEvent = (payload) => request('POST', '/events', loggerJwt, { event_value: 'SAMPLE', ...payload });
  const updateEvent = (id, payload) => request('PATCH', `/events/${id}`, loggerJwt, payload);
  const storedId = async (id) => {

    const event = await db.collection(eventsTable).findOne({ _id: new ObjectId(id) });
    const option = event.event_options.find((item) => item.event_option_name === 'sample_id');
    return option ? option.event_option_value : null;
  };

  const logSample = async (ts, options = []) => {

    const res = await createEvent({ ts, event_options: options });
    expect(res.statusCode).to.equal(201);
    return res.result.insertedId;
  };

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    for (const table of [usersTable, eventsTable, eventTemplatesTable, cruisesTable, loweringsTable, sequencesTable, sequenceCountersTable]) {
      await db.collection(table).deleteMany({});
    }

    await db.collection(usersTable).insertMany(users);
    await db.collection(cruisesTable).insertOne({ cruise_id: 'NA123', start_ts: new Date('2026-01-01T00:00:00Z'), stop_ts: new Date('2026-01-31T00:00:00Z') });
    await db.collection(loweringsTable).insertMany([
      { lowering_id: 'J2-1', start_ts: new Date('2026-01-10T00:00:00Z'), stop_ts: new Date('2026-01-11T00:00:00Z') },
      { lowering_id: 'J2-2', start_ts: new Date('2026-01-20T00:00:00Z'), stop_ts: new Date('2026-01-21T00:00:00Z') }
    ]);
    await db.collection(sequencesTable).insertOne({ ...sampleId, start: 1, description: '' });
    await db.collection(eventTemplatesTable).insertOne(template());
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('formats', () => {
    it('formats and parses IDs', () => {
      const parts = parseFormat('{cruise_id}/{lowering_id}-S{n:03}');
      const values = { cruise_id: 'NA123', lowering_id: 'J2-1' };
      expect(formatId(parts, values, 7)).to.equal('NA123/J2-1-S007');
      expect(formatId(parts, values, 1234)).to.equal('NA123/J2-1-S1234');
      expect(parseId(parts, values, 'NA123/J2-1-S020')).to.equal(20);
      expect(parseId(parts, values, 'NA123/J2-2-S020')).to.be.null();
      expect(parseId(parts, values, 'S020')).to.be.null();
    });

    it('rejects bad formats', () => {
      expect(() => parseFormat('S-{n}-{n}')).to.throw(/exactly once/);
      expect(() => parseFormat('S-{x}')).to.throw(/Unknown format piece \{x\}/);
      expect(() => parseFormat('{yyyy:2}-{n}')).to.throw(/Only \{n\} takes a width/);
      expect(() => parseFormat('S-{n')).to.throw(/Braces/);
    });
  });

  describe('definitions', () => {
    it('lets admins create sequences and anyone read them', async () => {
      let res = await request('POST', '/sequences', adminJwt, { name: 'cast', format: '{cruise_id}-CTD{n:02}', scope: 'cruise' });
      expect(res.statusCode).to.equal(201);
      expect(res.result).to.equal({ name: 'cast', format: '{cruise_id}-CTD{n:02}', scope: 'cruise', start: 1, description: '' });

      expect((await request('POST', '/sequences', loggerJwt, { name: 'x', format: '{n}', scope: 'global' })).statusCode).to.equal(403);
      expect((await request('POST', '/sequences', adminJwt, { name: 'cast', format: '{n}', scope: 'global' })).statusCode).to.equal(409);
      expect((await request('POST', '/sequences', adminJwt, { name: 'export', format: '{n}', scope: 'global' })).statusCode).to.equal(400);

      res = await request('POST', '/sequences', adminJwt, { name: 'bad', format: 'S{x}', scope: 'global' });
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.contain('{x}');

      res = await request('GET', '/sequences', loggerJwt);
      expect(res.result.map((sequence) => sequence.name)).to.equal(['cast', 'sample_id']);
      expect((await request('GET', '/sequences/cast', loggerJwt)).result.format).to.equal('{cruise_id}-CTD{n:02}');
    });

    it('changes the format after use, but not the scope', async () => {
      await logSample(inDive1);

      let res = await request('PATCH', '/sequences/sample_id', adminJwt, { scope: 'cruise', format: '{cruise_id}-S{n:03}' });
      expect(res.statusCode).to.equal(409);

      res = await request('PATCH', '/sequences/sample_id', adminJwt, { format: '{lowering_id}_{n:04}' });
      expect(res.statusCode).to.equal(204);
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1_0002');
    });

    it('refuses to delete a sequence templates use, and deletes its counters otherwise', async () => {
      await logSample(inDive1);

      let res = await request('DELETE', '/sequences/sample_id', adminJwt);
      expect(res.statusCode).to.equal(409);
      expect(res.result.message).to.contain('Sample');

      await db.collection(eventTemplatesTable).deleteMany({});
      res = await request('DELETE', '/sequences/sample_id', adminJwt);
      expect(res.statusCode).to.equal(204);
      expect(await db.collection(sequenceCountersTable).countDocuments({ sequence: 'sample_id' })).to.equal(0);
    });

    it('requires the scope\'s ID in a per-cruise or per-lowering format', async () => {
      let res = await request('POST', '/sequences', adminJwt, { name: 'bare', format: 'S{n:03}', scope: 'lowering' });
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.equal('A sequence numbered per lowering needs {lowering_id} in its format, or every lowering would issue the same IDs');

      // Checked against the stored definition on updates
      expect((await request('PATCH', '/sequences/sample_id', adminJwt, { format: 'S{n:03}' })).statusCode).to.equal(400);
      expect((await request('POST', '/sequences/import', adminJwt, [{ name: 'bare', format: 'S{n}', scope: 'cruise' }])).statusCode).to.equal(400);
      expect((await request('POST', '/sequences', adminJwt, { name: 'station', format: 'ST{n:03}', scope: 'global' })).statusCode).to.equal(201);
    });

    it('refuses an import that changes a used sequence\'s scope', async () => {
      await logSample(inDive1);

      const res = await request('POST', '/sequences/import', adminJwt, [{ name: 'cast', format: '{cruise_id}-C{n}', scope: 'cruise' }, { ...sampleId, scope: 'cruise', format: '{cruise_id}-S{n:03}' }]);
      expect(res.statusCode).to.equal(409);
      expect(await db.collection(sequencesTable).findOne({ name: 'sample_id' })).to.include({ scope: 'lowering' });
      expect(await db.collection(sequencesTable).findOne({ name: 'cast' })).to.not.exist();
    });

    it('exports and imports definitions without counters', async () => {
      await logSample(inDive1);

      const exported = (await request('GET', '/sequences/export', adminJwt)).result;
      expect(exported).to.equal([{ ...sampleId, start: 1, description: '' }]);

      const res = await request('POST', '/sequences/import', adminJwt, [{ ...sampleId, start: 5 }, { name: 'cast', format: '{cruise_id}-C{n}', scope: 'cruise' }]);
      expect(res.result).to.equal({ created: ['cast'], updated: ['sample_id'] });
      expect((await request('GET', '/sequences/sample_id/counters', adminJwt)).result).to.equal([{ scope_key: 'J2-1', last: 1, next: 2 }]);

      expect((await request('POST', '/sequences/import', adminJwt, [{ name: 'x', format: 'no counter', scope: 'global' }])).statusCode).to.equal(400);
    });
  });

  describe('event templates', () => {
    it('checks sequence options', async () => {
      let res = await request('POST', '/event_templates', adminJwt, template('nope', 'OTHER'));
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.contain('sequence nope, which doesn\'t exist');

      const missing = template('sample_id', 'OTHER');
      delete missing.event_options[0].event_option_sequence;
      res = await request('POST', '/event_templates', adminJwt, missing);
      expect(res.result.message).to.contain('needs an event_option_sequence');

      const wrongType = template('sample_id', 'OTHER');
      wrongType.event_options[1].event_option_sequence = 'sample_id';
      res = await request('POST', '/event_templates', adminJwt, wrongType);
      expect(res.result.message).to.contain('only sequence options');

      res = await request('POST', '/event_templates', adminJwt, template('sample_id', 'OTHER'));
      expect(res.statusCode).to.equal(201);
      const saved = await db.collection(eventTemplatesTable).findOne({ event_value: 'OTHER' });
      expect(saved.event_options[0]).to.include({ event_option_type: 'sequence', event_option_sequence: 'sample_id', event_option_values: [] });
    });
  });

  describe('events', () => {
    it('assigns the next ID in the lowering when options are sent', async () => {
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S001');
      expect(await storedId(await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: '' }, { event_option_name: 'Notes', event_option_value: 'x' }]))).to.equal('J2-1-S002');

      // Each lowering has its own counter
      expect(await storedId(await logSample(inDive2))).to.equal('J2-2-S001');
    });

    it('takes no number for a client\'s empty first step, then assigns on update and keeps it', async () => {
      const res = await createEvent({ ts: inDive1 });
      const id = res.result.insertedId;
      expect((await db.collection(eventsTable).findOne({ _id: new ObjectId(id) })).event_options).to.equal([]);

      // The dialog leaves empty options out
      expect((await updateEvent(id, { event_options: [{ event_option_name: 'Notes', event_option_value: 'x' }] })).statusCode).to.equal(204);
      expect(await storedId(id)).to.equal('J2-1-S001');

      // Later edits keep it, including a change of ts into another lowering
      await updateEvent(id, { event_options: [{ event_option_name: 'Notes', event_option_value: 'y' }] });
      await updateEvent(id, { ts: inDive2, event_options: [{ event_option_name: 'Notes', event_option_value: 'z' }] });
      expect(await storedId(id)).to.equal('J2-1-S001');
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S002');
    });

    it('keeps IDs typed by hand and moves the counter past ones in the format', async () => {
      const typed = await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S010' }]);
      expect(await storedId(typed)).to.equal('J2-1-S010');
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S011');

      // Not in the format (or for another lowering): stored, counter unchanged
      await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: 'bottle 4' }]);
      await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: 'J2-2-S050' }]);
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S012');

      // A lower number doesn't move it back
      await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S003' }]);
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S013');
    });

    it('doesn\'t move the counter for a typed number below the start', async () => {
      await request('PATCH', '/sequences/sample_id', adminJwt, { start: 100 });
      await logSample(inDive1, [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S005' }]);

      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S100');
    });

    it('ignores a same-named option in a template that doesn\'t use the sequence', async () => {
      await db.collection(eventTemplatesTable).insertOne({ ...template(), event_value: 'NOTE', event_options: [{ event_option_name: 'Sample ID', event_option_type: 'text', event_option_values: [], event_option_allow_freeform: false, event_option_required: false }] });
      await createEvent({ event_value: 'NOTE', ts: inDive1, event_options: [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S001' }] });

      // Not a duplicate, and not skipped
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S001');
    });

    it('gives no ID to an option hidden by its visibility rule', async () => {
      await db.collection(eventTemplatesTable).deleteMany({});
      const visible = template();
      visible.event_options.push({ event_option_name: 'Kind', event_option_type: 'dropdown', event_option_values: ['water', 'rock'], event_option_allow_freeform: false, event_option_required: false });
      visible.event_options[0].event_option_visibility = { show_hide: 'show if', event_option_name: 'Kind', event_option_values: ['water'] };
      await db.collection(eventTemplatesTable).insertOne(visible);

      const rock = await logSample(inDive1, [{ event_option_name: 'Kind', event_option_value: 'rock' }]);
      expect(await storedId(rock)).to.be.null();
      expect(await storedId(await logSample(inDive1, [{ event_option_name: 'Kind', event_option_value: 'water' }]))).to.equal('J2-1-S001');

      // hide if
      await db.collection(eventTemplatesTable).updateOne({ event_value: 'SAMPLE' }, { $set: { 'event_options.0.event_option_visibility.show_hide': 'hide if' } });
      expect(await storedId(await logSample(inDive1, [{ event_option_name: 'Kind', event_option_value: 'water' }]))).to.be.null();
      expect(await storedId(await logSample(inDive1, [{ event_option_name: 'Kind', event_option_value: 'rock' }]))).to.equal('J2-1-S002');
    });

    it('rejects a hand-typed ID another event already has', async () => {
      const first = await logSample(inDive1);

      const res = await createEvent({ ts: inDive1, event_options: [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S001' }] });
      expect(res.statusCode).to.equal(409);
      expect(res.result.message).to.equal('Option "sample_id": J2-1-S001 is already used by another event');

      // An event keeps its own ID through edits, but can't take another's
      const second = await logSample(inDive1);
      expect((await updateEvent(first, { event_options: [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S001' }, { event_option_name: 'Notes', event_option_value: 'x' }] })).statusCode).to.equal(204);
      expect((await updateEvent(second, { event_options: [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S001' }] })).statusCode).to.equal(409);
      expect(await storedId(second)).to.equal('J2-1-S002');
    });

    it('skips numbers whose ID another event already has', async () => {
      // Typed on an event in another lowering, so J2-1's counter doesn't move
      await logSample(inDive2, [{ event_option_name: 'Sample ID', event_option_value: 'J2-1-S002' }]);

      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S001');
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S003');
    });

    it('rejects an event that needs an ID outside the sequence\'s scope', async () => {
      const res = await createEvent({ ts: onDeck, event_options: [] });
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.equal('sample_id needs a lowering; no lowering covers 2026-01-15T12:00:00.000Z');

      // A hand-typed ID needs no scope
      expect((await createEvent({ ts: onDeck, event_options: [{ event_option_name: 'Sample ID', event_option_value: 'spare' }] })).statusCode).to.equal(201);
    });

    it('never gives two events the same number', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => createEvent({ ts: inDive1, event_options: [] })));
      const ids = await Promise.all(results.map((res) => storedId(res.result.insertedId)));

      expect(new Set(ids).size).to.equal(12);
      expect(ids.map((value) => Number(value.slice(-3))).sort((a, b) => a - b)).to.equal(Array.from({ length: 12 }, (x, i) => i + 1));
    });

    it('doesn\'t reuse the number of a deleted event', async () => {
      const id = await logSample(inDive1);
      await request('DELETE', `/events/${id}`, adminJwt);
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S002');
    });

    it('formats global sequences with date parts', async () => {
      await db.collection(sequencesTable).insertOne({ name: 'station', format: 'ST{yyyy}{doy}-{n:02}', scope: 'global', start: 1, description: '' });
      await db.collection(eventTemplatesTable).insertOne(template('station', 'STATION'));

      const res = await createEvent({ event_value: 'STATION', ts: onDeck, event_options: [] });
      expect(await storedId(res.result.insertedId)).to.equal('ST2026015-01');
    });
  });

  describe('reusing the current ID', () => {
    const pick = (name, type, values) => ({ event_option_name: name, event_option_type: type, event_option_values: values, event_option_allow_freeform: false, event_option_required: false });
    const castOption = (newWhen) => ({ ...pick('Cast ID', 'sequence', []), event_option_sequence: 'ctd_cast', event_option_default_value: '', event_option_sequence_new_when: newWhen });
    const startsCast = [{ event_option_name: 'Process', event_option_values: ['deployment'] }, { event_option_name: 'Action', event_option_values: ['start'] }];
    const ctdTemplate = (event_name, event_value, newWhen = startsCast) => ({
      event_name, event_value, event_free_text_required: false, system_template: false, template_categories: [],
      event_options: [castOption(newWhen), pick('Process', 'dropdown', ['deployment', 'recovery']), pick('Action', 'dropdown', ['start', 'bottle', 'end'])]
    });

    const at = (hour) => `2026-01-05T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const logCtd = async (hour, process, action, extra = {}) => {

      const options = [{ event_option_name: 'Process', event_option_value: process }, { event_option_name: 'Action', event_option_value: action }];
      return await request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: at(hour), event_options: options, ...extra });
    };

    const castOf = async (res) => {

      expect(res.statusCode).to.equal(201);
      const event = await db.collection(eventsTable).findOne({ _id: new ObjectId(res.result.insertedId) });
      return event.event_options.find((option) => option.event_option_name === 'cast_id').event_option_value;
    };

    beforeEach(async () => {
      await db.collection(sequencesTable).insertOne({ name: 'ctd_cast', format: '{cruise_id}-C{n:03}', scope: 'cruise', start: 1, description: '' });
      await db.collection(cruisesTable).insertOne({ cruise_id: 'NA124', start_ts: new Date('2026-02-01T00:00:00Z'), stop_ts: new Date('2026-02-28T00:00:00Z') });
      expect((await request('POST', '/event_templates', adminJwt, ctdTemplate('CTD', 'CTD'))).statusCode).to.equal(201);
    });

    it('starts a cast on the matching event and reuses it until the next', async () => {
      expect(await castOf(await logCtd(1, 'deployment', 'start'))).to.equal('NA123-C001');
      expect(await castOf(await logCtd(2, 'deployment', 'bottle'))).to.equal('NA123-C001');
      expect(await castOf(await logCtd(3, 'recovery', 'end'))).to.equal('NA123-C001');
      expect(await castOf(await logCtd(5, 'deployment', 'start'))).to.equal('NA123-C002');
      expect(await castOf(await logCtd(6, 'recovery', 'end'))).to.equal('NA123-C002');

      // Back-dated: the cast in progress at its time
      expect(await castOf(await logCtd(4, 'recovery', 'end'))).to.equal('NA123-C001');
    });

    it('reuses only IDs from templates using the sequence', async () => {
      await db.collection(eventTemplatesTable).insertOne({ ...ctdTemplate('Note', 'NOTE'), event_options: [pick('Cast ID', 'text', [])] });
      await logCtd(1, 'deployment', 'start');
      await request('POST', '/events', loggerJwt, { event_value: 'NOTE', ts: at(2), event_options: [{ event_option_name: 'Cast ID', event_option_value: 'not a cast' }] });

      expect(await castOf(await logCtd(3, 'deployment', 'bottle'))).to.equal('NA123-C001');
    });

    it('reuses the cast across templates using the sequence', async () => {
      await request('POST', '/event_templates', adminJwt, ctdTemplate('CTD bottle', 'CTD_BOTTLE', [{ event_option_name: 'Action', event_option_values: ['start'] }]));
      await logCtd(1, 'deployment', 'start');

      const res = await request('POST', '/events', loggerJwt, { event_value: 'CTD_BOTTLE', ts: at(2), event_options: [{ event_option_name: 'Action', event_option_value: 'bottle' }] });
      expect(await castOf(res)).to.equal('NA123-C001');
    });

    it('rejects an event with no current ID to reuse, including from another cruise', async () => {
      let res = await logCtd(1, 'deployment', 'bottle');
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.equal('Option "cast_id": no current ctd_cast ID to reuse; it takes a new one when process is deployment and action is start');

      await logCtd(2, 'deployment', 'start');
      res = await request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: '2026-02-02T00:00:00.000Z', event_options: [{ event_option_name: 'Process', event_option_value: 'recovery' }] });
      expect(res.statusCode).to.equal(400);
    });

    it('matches checkbox conditions on any ticked value', async () => {
      await db.collection(eventTemplatesTable).deleteMany({});
      const template = ctdTemplate('CTD', 'CTD', [{ event_option_name: 'Gear', event_option_values: ['rosette'] }]);
      template.event_options.push(pick('Gear', 'checkboxes', ['rosette', 'altimeter']));
      await request('POST', '/event_templates', adminJwt, template);

      const log = (hour, gear) => request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: at(hour), event_options: [{ event_option_name: 'Gear', event_option_value: gear }] });
      expect(await castOf(await log(1, 'altimeter;rosette'))).to.equal('NA123-C001');
      expect(await castOf(await log(2, 'altimeter'))).to.equal('NA123-C001');
      expect(await castOf(await log(3, 'rosette'))).to.equal('NA123-C002');
    });

    it('keeps an event\'s ID through edits', async () => {
      await logCtd(1, 'deployment', 'start');
      const bottle = (await logCtd(2, 'deployment', 'bottle')).result.insertedId;
      await logCtd(3, 'deployment', 'start');

      const res = await request('PATCH', `/events/${bottle}`, loggerJwt, { event_options: [{ event_option_name: 'Process', event_option_value: 'deployment' }, { event_option_name: 'Action', event_option_value: 'start' }] });
      expect(res.statusCode).to.equal(204);
      const event = await db.collection(eventsTable).findOne({ _id: new ObjectId(bottle) });
      expect(event.event_options.find((option) => option.event_option_name === 'cast_id').event_option_value).to.equal('NA123-C001');
    });

    it('checks typed IDs for duplicates only when they start a cast', async () => {
      await logCtd(1, 'deployment', 'start');
      const typed = { event_option_name: 'Cast ID', event_option_value: 'NA123-C001' };

      const reuse = await request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: at(2), event_options: [typed, { event_option_name: 'Action', event_option_value: 'bottle' }] });
      expect(reuse.statusCode).to.equal(201);

      const start = await request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: at(3), event_options: [typed, { event_option_name: 'Process', event_option_value: 'deployment' }, { event_option_name: 'Action', event_option_value: 'start' }] });
      expect(start.statusCode).to.equal(409);
    });

    it('checks the conditions on templates', async () => {
      const bad = ctdTemplate('Bad', 'BAD', [{ event_option_name: 'Depth', event_option_values: ['x'] }]);
      let res = await request('POST', '/event_templates', adminJwt, bad);
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.contain('names "Depth", which isn\'t another option of this template');

      const wrongType = ctdTemplate('Bad', 'BAD');
      wrongType.event_options[1].event_option_sequence_new_when = startsCast;
      res = await request('POST', '/event_templates', adminJwt, wrongType);
      expect(res.result.message).to.contain('only sequence options take event_option_sequence_new_when');
    });

    it('previews the current ID', async () => {
      let res = await request('GET', `/sequences/ctd_cast/current?ts=${at(1)}`, loggerJwt);
      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.equal('no current ctd_cast ID to reuse');

      await logCtd(1, 'deployment', 'start');
      res = await request('GET', `/sequences/ctd_cast/current?ts=${at(2)}`, loggerJwt);
      expect(res.result).to.equal({ id: 'NA123-C001' });
    });
  });

  describe('vessel demo', () => {
    it('numbers CTD casts with the demo sequence and CTD Cast template', async () => {
      await loadSeedBundle(db);

      for (const sequence of DemoSequences) {
        expect((await request('POST', '/sequences', adminJwt, sequence)).statusCode).to.equal(201);
      }

      const { id, ...ctdCast } = DemoVesselTemplates.find((template) => template.event_name === 'CTD Cast');
      expect((await request('POST', '/event_templates', adminJwt, ctdCast)).statusCode).to.equal(201);

      const logCast = async (hour, process, action) => {

        const options = [{ event_option_name: 'Process', event_option_value: process }, { event_option_name: 'Action', event_option_value: action }];
        const res = await request('POST', '/events', loggerJwt, { event_value: 'CTD', ts: `2026-01-05T0${hour}:00:00.000Z`, event_options: options });
        expect(res.statusCode).to.equal(201);
        const event = await db.collection(eventsTable).findOne({ _id: new ObjectId(res.result.insertedId) });
        return event.event_options.find((option) => option.event_option_name === 'cast_id').event_option_value;
      };

      expect(await logCast(1, 'Deployment', 'Start')).to.equal('NA123_CTD001_0105');
      expect(await logCast(2, 'Profile', 'AtMaxDepth')).to.equal('NA123_CTD001_0105');
      expect(await logCast(3, 'Recovery', 'OnBoard')).to.equal('NA123_CTD001_0105');
      expect(await logCast(4, 'Deployment', 'Start')).to.equal('NA123_CTD002_0105');
    });
  });

  describe('preview and counters', () => {
    it('previews the next ID without taking it', async () => {
      await logSample(inDive1);

      let res = await request('GET', `/sequences/sample_id/next?ts=${inDive1}`, loggerJwt);
      expect(res.result).to.equal({ id: 'J2-1-S002', n: 2, scope_key: 'J2-1', prefix: 'J2-1-S', suffix: '' });
      res = await request('GET', `/sequences/sample_id/next?ts=${inDive1}`, loggerJwt);
      expect(res.result.id).to.equal('J2-1-S002');

      res = await request('GET', `/sequences/sample_id/next?ts=${onDeck}`, loggerJwt);
      expect(res.statusCode).to.equal(400);
      expect((await request('GET', '/sequences/nope/next', loggerJwt)).statusCode).to.equal(404);
    });

    it('lists counters and sets the next number', async () => {
      await logSample(inDive1);
      await logSample(inDive2);

      expect((await request('GET', '/sequences/sample_id/counters', loggerJwt)).statusCode).to.equal(403);
      expect((await request('GET', '/sequences/sample_id/counters', adminJwt)).result).to.equal([
        { scope_key: 'J2-1', last: 1, next: 2 },
        { scope_key: 'J2-2', last: 1, next: 2 }
      ]);

      expect((await request('PUT', '/sequences/sample_id/counters', adminJwt, { scope_key: 'J2-1', next: 50 })).statusCode).to.equal(204);
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S050');

      // A lowering sequence needs a lowering_id; a new one can be set ahead of use
      expect((await request('PUT', '/sequences/sample_id/counters', adminJwt, { scope_key: '', next: 5 })).statusCode).to.equal(400);
      await request('PUT', '/sequences/sample_id/counters', adminJwt, { scope_key: 'J2-9', next: 100 });
      expect((await request('GET', '/sequences/sample_id/counters', adminJwt)).result.find((counter) => counter.scope_key === 'J2-9').next).to.equal(100);
    });

    it('starts new counters at the sequence\'s start', async () => {
      await request('PATCH', '/sequences/sample_id', adminJwt, { start: 100 });
      expect(await storedId(await logSample(inDive1))).to.equal('J2-1-S100');
    });
  });
});
