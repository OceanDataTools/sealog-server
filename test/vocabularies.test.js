'use strict';

const Zlib = require('zlib');
const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { beforeEach, afterEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const Jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const SECRET = require('../config/secret');
const { usersTable, eventTemplatesTable, eventAuxDataTable } = require('../config/db_constants');
const {
  applyVocabulary,
  loadSeedBundle,
  parseNvsCollection,
  vocabulariesTable,
  vocabularyTermsTable
} = require('../lib/vocabularies');

// An NVS collection as JSON-LD (nvs profile), as returned by vocab.nerc.ac.uk
const nvsDoc = (version, terms) => ({
  '@graph': [
    {
      '@id': 'http://vocab.nerc.ac.uk/collection/EL1/current/',
      '@type': 'skos:Collection',
      'dc:title': 'Platform Event Actions',
      'owl:versionInfo': version,
      'dc:license': { '@id': 'https://creativecommons.org/licenses/by/4.0/' },
      'dc:creator': 'SeaDataNet and MarineXML Vocabulary Content Governance Group'
    },
    ...terms.map((term) => ({
      '@id': `http://vocab.nerc.ac.uk/collection/EL1/current/${term.id}/`,
      '@type': 'skos:Concept',
      'skos:notation': `SDN:EL1::${term.id}`,
      'skos:prefLabel': { '@language': 'en', '@value': term.label },
      'skos:altLabel': term.alt || '',
      'skos:definition': { '@language': 'en', '@value': `${term.label} definition` },
      'owl:deprecated': term.deprecated ? 'true' : 'false',
      ...(term.replacedBy && { 'dc:isReplacedBy': { '@id': `http://vocab.nerc.ac.uk/collection/EL1/current/${term.replacedBy}/` } })
    }))
  ]
});

const el1Doc = nvsDoc('1', [
  { id: 'act16', label: 'InWater' },
  { id: 'act7', label: 'OnBottom', alt: 'Bottom contact' },
  { id: 'act1', label: 'Start' }
]);

const l22 = {
  collection: 'L22',
  title: 'SeaVoX Device Catalogue',
  uri: 'http://vocab.nerc.ac.uk/collection/L22/current/',
  version: '890',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'SeaDataNet',
  terms: [
    { id: 'TOOL0058', notation: 'SDN:L22::TOOL0058', uri: 'http://vocab.nerc.ac.uk/collection/L22/current/TOOL0058/', prefLabel: 'Sea-Bird SBE 911plus CTD', altLabel: '', definition: '', deprecated: false, replacedBy: [], broader: ['SDN:L05::130'] },
    { id: 'TOOL0001', notation: 'SDN:L22::TOOL0001', uri: 'http://vocab.nerc.ac.uk/collection/L22/current/TOOL0001/', prefLabel: 'Old (CTD) profiler', altLabel: '', definition: '', deprecated: true, replacedBy: ['SDN:L22::TOOL0058'], broader: ['SDN:L05::130'] },
    { id: 'NETT0028', notation: 'SDN:L22::NETT0028', uri: 'http://vocab.nerc.ac.uk/collection/L22/current/NETT0028/', prefLabel: 'MOCNESS', altLabel: '', definition: '', deprecated: false, replacedBy: [], broader: ['SDN:L05::22'] }
  ]
};

describe('Vocabularies API', () => {
  let server;
  let db;
  const originalFetch = global.fetch;

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

  const users = [
    user(1, 'admin', ['admin']),
    user(2, 'watcher', ['event_watcher']),
    user(3, 'logger', ['event_logger']),
    user(4, 'templates', ['template_manager'])
  ];

  const jwt = (index, scope) => 'Bearer ' + Jwt.sign({ id: users[index]._id, roles: users[index].roles, scope }, SECRET);
  const adminJwt = jwt(0, ['admin']);
  const watcherJwt = jwt(1, ['read_events', 'read_cruises', 'read_lowerings']);
  const loggerJwt = jwt(2, ['read_events', 'write_events', 'read_event_templates', 'read_cruises', 'read_lowerings']);
  const templateManagerJwt = jwt(3, ['read_events', 'write_events', 'read_event_templates', 'write_event_templates', 'read_cruises', 'read_lowerings']);

  const request = (method, url, token, payload) => server.inject({
    method,
    url: `/sealog-server/api/v1${url}`,
    headers: token ? { Authorization: token } : {},
    payload
  });

  const stubFetch = (response) => {

    global.fetch = (url) => {

      if (response instanceof Error) {
        return Promise.reject(response);
      }

      return Promise.resolve({ ok: response.status === 200, status: response.status, json: () => Promise.resolve(response.body) });
    };
  };

  beforeEach(async () => {
    server = await init();
    db = server.mongo.db;
    await db.collection(usersTable).deleteMany({});
    await db.collection(eventTemplatesTable).deleteMany({});
    await db.collection(vocabulariesTable).deleteMany({});
    await db.collection(vocabularyTermsTable).deleteMany({});
    await db.collection(eventAuxDataTable).deleteMany({ data_source: 'vocab' });
    await db.collection(usersTable).insertMany(users);
    await applyVocabulary(db, parseNvsCollection('EL1', el1Doc), 'nvs');
    await applyVocabulary(db, l22, 'import');
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await server.stop();
  });

  describe('parseNvsCollection', () => {
    it('reads the collection metadata and terms', () => {
      const vocabulary = parseNvsCollection('EL1', nvsDoc('2', [{ id: 'act7', label: 'OnBottom', deprecated: true, replacedBy: 'act16' }]));

      expect(vocabulary.title).to.equal('Platform Event Actions');
      expect(vocabulary.version).to.equal('2');
      expect(vocabulary.license).to.equal('https://creativecommons.org/licenses/by/4.0/');
      expect(vocabulary.terms).to.equal([{
        id: 'act7',
        notation: 'SDN:EL1::act7',
        uri: 'http://vocab.nerc.ac.uk/collection/EL1/current/act7/',
        prefLabel: 'OnBottom',
        altLabel: '',
        definition: 'OnBottom definition',
        deprecated: true,
        replacedBy: ['SDN:EL1::act16'],
        broader: []
      }]);
    });

    it('prefers English when a literal has several languages', () => {
      const doc = nvsDoc('1', [{ id: 'act1', label: 'Start' }]);
      doc['@graph'][1]['skos:prefLabel'] = [{ '@language': 'fr', '@value': 'Début' }, { '@language': 'en', '@value': 'Start' }];

      expect(parseNvsCollection('EL1', doc).terms[0].prefLabel).to.equal('Start');
    });

    it('rejects a collection without terms', () => {
      expect(() => parseNvsCollection('EL1', nvsDoc('1', []))).to.throw('No terms found in NVS collection EL1');
    });
  });

  describe('GET /vocabularies', () => {
    it('lists the cached vocabularies for any authenticated user', async () => {
      const res = await request('GET', '/vocabularies', watcherJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result.map((vocabulary) => vocabulary.collection)).to.equal(['EL1', 'L22']);
      expect(res.result[0]).to.include({ version: '1', term_count: 3, source: 'nvs', license: 'https://creativecommons.org/licenses/by/4.0/' });
    });

    it('returns 401 without JWT', async () => {
      const res = await request('GET', '/vocabularies');
      expect(res.statusCode).to.equal(401);
    });
  });

  describe('GET /vocabularies/{collection}/terms', () => {
    it('returns the non-deprecated terms sorted by label', async () => {
      const res = await request('GET', '/vocabularies/L22/terms', watcherJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result.map((term) => term.id)).to.equal(['NETT0028', 'TOOL0058']);
    });

    it('includes deprecated terms when asked', async () => {
      const res = await request('GET', '/vocabularies/L22/terms?include_deprecated=true', watcherJwt);
      expect(res.result.map((term) => term.id)).to.equal(['NETT0028', 'TOOL0001', 'TOOL0058']);
    });

    it('matches q against labels, alternative labels and IDs, ignoring case', async () => {
      let res = await request('GET', '/vocabularies/EL1/terms?q=bottom', watcherJwt);
      expect(res.result.map((term) => term.id)).to.equal(['act7']);

      res = await request('GET', '/vocabularies/EL1/terms?q=CONTACT', watcherJwt);
      expect(res.result.map((term) => term.id)).to.equal(['act7']);

      res = await request('GET', '/vocabularies/L22/terms?q=tool0058', watcherJwt);
      expect(res.result.map((term) => term.id)).to.equal(['TOOL0058']);
    });

    it('treats q as plain text, not a regular expression', async () => {
      const res = await request('GET', '/vocabularies/L22/terms?q=(CTD&include_deprecated=true', watcherJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result.map((term) => term.id)).to.equal(['TOOL0001']);
    });

    it('filters by broader term', async () => {
      const res = await request('GET', '/vocabularies/L22/terms?broader=SDN:L05::22', watcherJwt);
      expect(res.result.map((term) => term.id)).to.equal(['NETT0028']);
    });

    it('pages with offset and limit', async () => {
      const res = await request('GET', '/vocabularies/EL1/terms?offset=1&limit=1', watcherJwt);
      expect(res.result.map((term) => term.prefLabel)).to.equal(['OnBottom']);
    });

    it('returns an empty array when nothing matches', async () => {
      const res = await request('GET', '/vocabularies/EL1/terms?q=nothing', watcherJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result).to.equal([]);
    });

    it('returns 404 for a vocabulary that is not cached', async () => {
      const res = await request('GET', '/vocabularies/P01/terms', watcherJwt);
      expect(res.statusCode).to.equal(404);
    });

    it('returns 400 for an invalid collection code', async () => {
      const res = await request('GET', '/vocabularies/el1/terms', watcherJwt);
      expect(res.statusCode).to.equal(400);
    });
  });

  describe('GET /vocabularies/{collection}/terms/{id}', () => {
    it('returns a single term', async () => {
      const res = await request('GET', '/vocabularies/EL1/terms/act16', watcherJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result).to.include({ collection: 'EL1', notation: 'SDN:EL1::act16', prefLabel: 'InWater' });
    });

    it('returns 404 for an unknown term', async () => {
      const res = await request('GET', '/vocabularies/EL1/terms/act99', watcherJwt);
      expect(res.statusCode).to.equal(404);
    });
  });

  describe('POST /vocabularies/{collection}/refresh', () => {
    const refreshed = nvsDoc('2', [
      { id: 'act16', label: 'InWater' },
      { id: 'act7', label: 'OnBottom', deprecated: true, replacedBy: 'act16' },
      { id: 'act25', label: 'Released' }
    ]);

    it('replaces the cached copy and reports what changed', async () => {
      const template = {
        event_name: 'CTD',
        event_value: 'CTD',
        event_free_text_required: false,
        system_template: false,
        template_categories: [],
        event_options: [{
          event_option_name: 'Action',
          event_option_type: 'dropdown',
          event_option_values: ['OnBottom', 'Start', 'InWater'],
          event_option_allow_freeform: false,
          event_option_required: true,
          event_option_vocab: {
            collection: 'EL1',
            terms: [
              { value: 'OnBottom', notation: 'SDN:EL1::act7' },
              { value: 'Start', notation: 'SDN:EL1::act1' },
              { value: 'InWater', notation: 'SDN:EL1::act16' }
            ]
          }
        }]
      };
      const { insertedId } = await db.collection(eventTemplatesTable).insertOne(template);
      stubFetch({ status: 200, body: refreshed });

      const res = await request('POST', '/vocabularies/EL1/refresh', templateManagerJwt);

      expect(res.statusCode).to.equal(200);
      expect(res.result).to.include({
        collection: 'EL1',
        version: '2',
        previous_version: '1',
        source: 'nvs',
        term_count: 3,
        added: ['SDN:EL1::act25'],
        deprecated: ['SDN:EL1::act7'],
        removed: ['SDN:EL1::act1']
      });
      expect(res.result.affected_templates).to.equal([
        { template_id: insertedId.toString(), event_name: 'CTD', event_option_name: 'Action', value: 'OnBottom', notation: 'SDN:EL1::act7', status: 'deprecated', replaced_by: ['SDN:EL1::act16'] },
        { template_id: insertedId.toString(), event_name: 'CTD', event_option_name: 'Action', value: 'Start', notation: 'SDN:EL1::act1', status: 'removed', replaced_by: [] }
      ]);

      const terms = await db.collection(vocabularyTermsTable).find({ collection: 'EL1' }).toArray();
      expect(terms.map((term) => term.id).sort()).to.equal(['act16', 'act25', 'act7']);
      expect(await db.collection(vocabulariesTable).findOne({ collection: 'EL1' })).to.include({ version: '2', source: 'nvs', term_count: 3 });
    });

    it('keeps the cached copy when NVS returns an error', async () => {
      stubFetch({ status: 503 });

      const res = await request('POST', '/vocabularies/EL1/refresh', adminJwt);

      expect(res.statusCode).to.equal(502);
      expect(res.result.message).to.contain('HTTP 503');
      expect(await db.collection(vocabularyTermsTable).countDocuments({ collection: 'EL1' })).to.equal(3);
      expect(await db.collection(vocabulariesTable).findOne({ collection: 'EL1' })).to.include({ version: '1' });
    });

    it('keeps the cached copy when NVS is unreachable', async () => {
      stubFetch(new Error('getaddrinfo ENOTFOUND vocab.nerc.ac.uk'));

      const res = await request('POST', '/vocabularies/EL1/refresh', adminJwt);

      expect(res.statusCode).to.equal(502);
      expect(await db.collection(vocabularyTermsTable).countDocuments({ collection: 'EL1' })).to.equal(3);
    });

    it('rejects a collection that is not configured', async () => {
      const res = await request('POST', '/vocabularies/P01/refresh', adminJwt);
      expect(res.statusCode).to.equal(400);
    });

    it('returns 403 for event_logger', async () => {
      const res = await request('POST', '/vocabularies/EL1/refresh', loggerJwt);
      expect(res.statusCode).to.equal(403);
    });
  });

  describe('export and import', () => {
    it('exports a bundle that import restores', async () => {
      const exported = await request('GET', '/vocabularies/export', templateManagerJwt);

      expect(exported.statusCode).to.equal(200);
      expect(exported.headers['content-disposition']).to.match(/^attachment; filename="sealog-vocabularies-\d{8}\.json"$/);
      expect(exported.result.vocabularies.map((vocabulary) => vocabulary.collection)).to.equal(['EL1', 'L22']);
      expect(exported.result.vocabularies[1].terms[0]).to.not.include(['_id', 'collection']);

      await db.collection(vocabulariesTable).deleteMany({});
      await db.collection(vocabularyTermsTable).deleteMany({});

      const imported = await request('POST', '/vocabularies/import', templateManagerJwt, exported.result);

      expect(imported.statusCode).to.equal(200);
      expect(imported.result.map((report) => [report.collection, report.term_count, report.added.length])).to.equal([['EL1', 3, 3], ['L22', 3, 3]]);
      expect(await db.collection(vocabularyTermsTable).countDocuments()).to.equal(6);
      expect(await db.collection(vocabulariesTable).findOne({ collection: 'L22' })).to.include({ version: '890', source: 'import' });
    });

    it('accepts a gzip-compressed bundle', async () => {
      const exported = await request('GET', '/vocabularies/export', adminJwt);

      const res = await server.inject({
        method: 'POST',
        url: '/sealog-server/api/v1/vocabularies/import',
        headers: { Authorization: adminJwt, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        payload: Zlib.gzipSync(JSON.stringify(exported.result))
      });

      expect(res.statusCode).to.equal(200);
      expect(res.result.length).to.equal(2);
    });

    it('rejects a bundle with an empty vocabulary', async () => {
      const res = await request('POST', '/vocabularies/import', adminJwt, {
        format: 'sealog-vocabularies',
        format_version: 1,
        vocabularies: [{ collection: 'EL1', terms: [] }]
      });

      expect(res.statusCode).to.equal(400);
    });

    it('returns 403 for event_logger', async () => {
      expect((await request('GET', '/vocabularies/export', loggerJwt)).statusCode).to.equal(403);
      expect((await request('POST', '/vocabularies/import', loggerJwt, {})).statusCode).to.equal(403);
    });
  });

  describe('DELETE /vocabularies/{collection}', () => {
    it('deletes the vocabulary and its terms', async () => {
      const res = await request('DELETE', '/vocabularies/L22', adminJwt);

      expect(res.statusCode).to.equal(204);
      expect(await db.collection(vocabulariesTable).findOne({ collection: 'L22' })).to.not.exist();
      expect(await db.collection(vocabularyTermsTable).countDocuments({ collection: 'L22' })).to.equal(0);
      expect(await db.collection(vocabularyTermsTable).countDocuments({ collection: 'EL1' })).to.equal(3);
    });

    it('returns 404 for a vocabulary that is not cached', async () => {
      const res = await request('DELETE', '/vocabularies/P01', adminJwt);
      expect(res.statusCode).to.equal(404);
    });

    it('is admin only', async () => {
      const res = await request('DELETE', '/vocabularies/L22', templateManagerJwt);
      expect(res.statusCode).to.equal(403);
    });
  });

  describe('visibility', () => {
    const terms = async (url) => (await request('GET', url, watcherJwt)).result.map((term) => term.id);

    it('shows every term by default', async () => {
      const res = await request('GET', '/vocabularies', watcherJwt);
      const el1 = res.result.find((vocabulary) => vocabulary.collection === 'EL1');

      expect(el1).to.include({ visibility_mode: 'hide_listed', visible_count: 3 });
      expect((await request('GET', '/vocabularies/EL1/visibility', watcherJwt)).result).to.equal({ mode: 'hide_listed', terms: [] });
    });

    it('hides the listed terms', async () => {
      const res = await request('PUT', '/vocabularies/EL1/visibility', templateManagerJwt, { mode: 'hide_listed', terms: ['act1'] });
      expect(res.statusCode).to.equal(200);

      expect(await terms('/vocabularies/EL1/terms')).to.equal(['act16', 'act7']);

      const all = (await request('GET', '/vocabularies/EL1/terms?include_hidden=true', watcherJwt)).result;
      expect(all.map((term) => [term.id, term.hidden])).to.equal([['act16', false], ['act7', false], ['act1', true]]);

      const hidden = await request('GET', '/vocabularies/EL1/terms/act1', watcherJwt);
      expect(hidden.statusCode).to.equal(200);
      expect(hidden.result.hidden).to.be.true();

      const list = await request('GET', '/vocabularies', watcherJwt);
      expect(list.result.find((vocabulary) => vocabulary.collection === 'EL1').visible_count).to.equal(2);
    });

    it('shows only the listed terms, and keeps new terms hidden after a refresh', async () => {
      await request('PUT', '/vocabularies/L22/visibility', adminJwt, { mode: 'show_only_listed', terms: ['TOOL0058'] });
      expect(await terms('/vocabularies/L22/terms')).to.equal(['TOOL0058']);

      await applyVocabulary(db, { ...l22, terms: [...l22.terms, { ...l22.terms[0], id: 'TOOL9999', notation: 'SDN:L22::TOOL9999', prefLabel: 'New CTD' }] }, 'nvs');

      expect(await terms('/vocabularies/L22/terms')).to.equal(['TOOL0058']);
      expect((await request('GET', '/vocabularies/L22/visibility', watcherJwt)).result).to.equal({ mode: 'show_only_listed', terms: ['TOOL0058'] });
    });

    it('shows and hides single terms in either mode', async () => {
      await request('PUT', '/vocabularies/L22/visibility', adminJwt, { mode: 'show_only_listed', terms: ['TOOL0058'] });

      let res = await request('PATCH', '/vocabularies/L22/terms/NETT0028/visibility', templateManagerJwt, { hidden: false });
      expect(res.result).to.equal({ mode: 'show_only_listed', terms: ['NETT0028', 'TOOL0058'] });

      res = await request('PATCH', '/vocabularies/L22/terms/TOOL0058/visibility', templateManagerJwt, { hidden: true });
      expect(res.result).to.equal({ mode: 'show_only_listed', terms: ['NETT0028'] });

      await request('PUT', '/vocabularies/EL1/visibility', adminJwt, { mode: 'hide_listed', terms: [] });
      res = await request('PATCH', '/vocabularies/EL1/terms/act7/visibility', templateManagerJwt, { hidden: true });
      expect(res.result).to.equal({ mode: 'hide_listed', terms: ['act7'] });
    });

    it('rejects unknown terms', async () => {
      const res = await request('PUT', '/vocabularies/L22/visibility', adminJwt, { mode: 'show_only_listed', terms: ['TOOL0058', 'NOPE'] });

      expect(res.statusCode).to.equal(400);
      expect(res.result.message).to.contain('NOPE');
      expect((await request('PATCH', '/vocabularies/L22/terms/NOPE/visibility', adminJwt, { hidden: true })).statusCode).to.equal(404);
    });

    it('is not exported, and an import does not change it', async () => {
      await request('PUT', '/vocabularies/EL1/visibility', adminJwt, { mode: 'hide_listed', terms: ['act1'] });

      const exported = await request('GET', '/vocabularies/export', adminJwt);
      expect(exported.result.vocabularies[0]).to.not.include('visibility');

      await request('POST', '/vocabularies/import', adminJwt, exported.result);
      expect((await request('GET', '/vocabularies/EL1/visibility', watcherJwt)).result.terms).to.equal(['act1']);
    });

    it('returns 403 for event_logger', async () => {
      expect((await request('PUT', '/vocabularies/EL1/visibility', loggerJwt, { mode: 'hide_listed', terms: [] })).statusCode).to.equal(403);
      expect((await request('PATCH', '/vocabularies/EL1/terms/act1/visibility', loggerJwt, { hidden: true })).statusCode).to.equal(403);
    });
  });

  describe('local vocabularies', () => {
    const createLocal = (payload = { collection: 'SKQEQ', title: 'Sikuliaq equipment', prefix: 'SKQ' }) => request('POST', '/vocabularies', templateManagerJwt, payload);
    const addTerm = (payload, collection = 'SKQEQ') => request('POST', `/vocabularies/${collection}/terms`, templateManagerJwt, payload);

    it('creates a local vocabulary with the default prefix', async () => {
      const res = await createLocal({ collection: 'LOCALEQ', title: 'Local equipment' });

      expect(res.statusCode).to.equal(201);
      expect(res.result).to.include({ collection: 'LOCALEQ', source: 'local', prefix: 'CV', term_count: 0 });
    });

    it('adds terms with notations under the vocabulary prefix', async () => {
      await createLocal();

      const res = await addTerm({ id: 'ROV-ODYSSEY', prefLabel: 'ROV Odyssey', broader: ['SDN:L05::22'] });

      expect(res.statusCode).to.equal(201);
      expect(res.result).to.include({ collection: 'SKQEQ', id: 'ROV-ODYSSEY', notation: 'SKQ:SKQEQ::ROV-ODYSSEY', prefLabel: 'ROV Odyssey', deprecated: false, broader: ['SDN:L05::22'] });
      expect((await request('GET', '/vocabularies/SKQEQ/terms', watcherJwt)).result.map((term) => term.notation)).to.equal(['SKQ:SKQEQ::ROV-ODYSSEY']);
      expect((await db.collection(vocabulariesTable).findOne({ collection: 'SKQEQ' })).term_count).to.equal(1);
    });

    it('rejects duplicate and invalid codes and term IDs', async () => {
      await createLocal();

      expect((await createLocal()).statusCode).to.equal(409);
      expect((await createLocal({ collection: 'L22', title: 'Not NVS' })).statusCode).to.equal(400);
      expect((await createLocal({ collection: 'skq', title: 'Lowercase' })).statusCode).to.equal(400);

      await addTerm({ id: 'CTD1', prefLabel: 'CTD 1' });
      expect((await addTerm({ id: 'CTD1', prefLabel: 'Again' })).statusCode).to.equal(409);
      expect((await addTerm({ id: 'CTD 2', prefLabel: 'Space' })).statusCode).to.equal(400);
    });

    it('updates labels but not IDs', async () => {
      await createLocal();
      await addTerm({ id: 'CTD1', prefLabel: 'CTD 1' });

      const res = await request('PATCH', '/vocabularies/SKQEQ/terms/CTD1', templateManagerJwt, { prefLabel: 'Main CTD', definition: 'The rosette CTD' });
      expect(res.statusCode).to.equal(204);
      expect((await request('GET', '/vocabularies/SKQEQ/terms/CTD1', watcherJwt)).result).to.include({ prefLabel: 'Main CTD', definition: 'The rosette CTD', notation: 'SKQ:SKQEQ::CTD1' });

      expect((await request('PATCH', '/vocabularies/SKQEQ/terms/CTD1', templateManagerJwt, { id: 'CTD2' })).statusCode).to.equal(400);
      expect((await request('PATCH', '/vocabularies/SKQEQ/terms/NOPE', templateManagerJwt, { prefLabel: 'x' })).statusCode).to.equal(404);
    });

    it('deletes unused terms and deprecates terms recorded on events', async () => {
      await createLocal();
      await addTerm({ id: 'CTD1', prefLabel: 'CTD 1' });
      await addTerm({ id: 'ROV-ODYSSEY', prefLabel: 'ROV Odyssey' });
      await db.collection(eventAuxDataTable).insertOne({ event_id: new ObjectId(), data_source: 'vocab', data_array: [{ data_name: 'instrument', data_value: 'SKQ:SKQEQ::ROV-ODYSSEY', data_uom: 'notation' }] });

      let res = await request('DELETE', '/vocabularies/SKQEQ/terms/CTD1', templateManagerJwt);
      expect(res.result).to.equal({ id: 'CTD1', action: 'deleted' });

      res = await request('DELETE', '/vocabularies/SKQEQ/terms/ROV-ODYSSEY', templateManagerJwt);
      expect(res.result).to.equal({ id: 'ROV-ODYSSEY', action: 'deprecated' });

      const remaining = await db.collection(vocabularyTermsTable).find({ collection: 'SKQEQ' }).toArray();
      expect(remaining.map((term) => [term.id, term.deprecated])).to.equal([['ROV-ODYSSEY', true]]);
    });

    it('refuses term edits on downloaded vocabularies', async () => {
      const res = await addTerm({ id: 'NEW', prefLabel: 'New' }, 'L22');

      expect(res.statusCode).to.equal(409);
      expect(res.result.message).to.contain('visibility');
      expect((await request('PATCH', '/vocabularies/L22/terms/TOOL0058', adminJwt, { prefLabel: 'x' })).statusCode).to.equal(409);
      expect((await request('DELETE', '/vocabularies/L22/terms/TOOL0058', adminJwt)).statusCode).to.equal(409);
    });

    it('stays local and keeps its prefix when moved by export and import', async () => {
      await createLocal();
      await addTerm({ id: 'CTD1', prefLabel: 'CTD 1' });

      const exported = await request('GET', '/vocabularies/export', adminJwt);
      await db.collection(vocabulariesTable).deleteOne({ collection: 'SKQEQ' });
      await db.collection(vocabularyTermsTable).deleteMany({ collection: 'SKQEQ' });

      expect((await request('POST', '/vocabularies/import', adminJwt, exported.result)).statusCode).to.equal(200);
      expect(await db.collection(vocabulariesTable).findOne({ collection: 'SKQEQ' })).to.include({ source: 'local', prefix: 'SKQ', term_count: 1 });
      expect((await addTerm({ id: 'CTD2', prefLabel: 'CTD 2' })).result.notation).to.equal('SKQ:SKQEQ::CTD2');
    });

    it('cannot be refreshed', async () => {
      await createLocal();
      expect((await request('POST', '/vocabularies/SKQEQ/refresh', adminJwt)).statusCode).to.equal(400);
    });

    it('returns 403 for event_logger', async () => {
      expect((await request('POST', '/vocabularies', loggerJwt, { collection: 'SKQEQ', title: 'x' })).statusCode).to.equal(403);
      await createLocal();
      expect((await request('POST', '/vocabularies/SKQEQ/terms', loggerJwt, { id: 'A', prefLabel: 'A' })).statusCode).to.equal(403);
    });
  });

  describe('deprecate instead of delete', () => {
    const recordOnEvent = (notation) => db.collection(eventAuxDataTable).insertOne({ event_id: new ObjectId(), data_source: 'vocab', data_array: [{ data_name: 'action', data_value: notation, data_uom: 'notation' }] });
    const refreshWith = (doc) => {

      stubFetch({ status: 200, body: doc });
      return request('POST', '/vocabularies/EL1/refresh', adminJwt);
    };

    it('keeps a removed term that is recorded on events, deprecated', async () => {
      await recordOnEvent('SDN:EL1::act1');
      const withoutStart = nvsDoc('2', [{ id: 'act16', label: 'InWater' }, { id: 'act7', label: 'OnBottom' }]);

      let res = await refreshWith(withoutStart);
      expect(res.result).to.include({ removed: [], retained: ['SDN:EL1::act1'], term_count: 3 });
      expect(await db.collection(vocabularyTermsTable).findOne({ collection: 'EL1', id: 'act1' })).to.include({ deprecated: true, source_removed: true });

      // Not reported again by the next refresh
      res = await refreshWith(withoutStart);
      expect(res.result).to.include({ removed: [], retained: [] });

      // Restored if the source brings it back
      res = await refreshWith(el1Doc);
      expect(await db.collection(vocabularyTermsTable).findOne({ collection: 'EL1', id: 'act1' })).to.include({ deprecated: false }).and.to.not.include('source_removed');
    });

    it('still deletes removed terms that no event uses', async () => {
      const res = await refreshWith(nvsDoc('2', [{ id: 'act16', label: 'InWater' }, { id: 'act7', label: 'OnBottom' }]));

      expect(res.result).to.include({ removed: ['SDN:EL1::act1'], retained: [], term_count: 2 });
    });

    it('applies to imports too', async () => {
      await recordOnEvent('SDN:L22::NETT0028');
      const bundle = { format: 'sealog-vocabularies', format_version: 1, vocabularies: [{ ...l22, terms: l22.terms.filter((term) => term.id !== 'NETT0028') }] };

      const res = await request('POST', '/vocabularies/import', adminJwt, bundle);
      expect(res.result[0]).to.include({ removed: [], retained: ['SDN:L22::NETT0028'] });
    });
  });

  describe('seed bundle', () => {
    it('loads the configured collections', async () => {
      const reports = await loadSeedBundle(db);

      expect(reports.map((report) => report.collection)).to.equal(['EL1', 'EL2', 'L05', 'L06', 'L22']);

      const vocabularies = await db.collection(vocabulariesTable).find({}).sort({ collection: 1 }).toArray();
      expect(vocabularies.every((vocabulary) => vocabulary.source === 'seed')).to.be.true();
      expect(vocabularies.find((vocabulary) => vocabulary.collection === 'L22').term_count).to.be.above(2000);

      const ctd = await db.collection(vocabularyTermsTable).findOne({ collection: 'L22', id: 'TOOL0058' });
      expect(ctd.broader.some((notation) => notation.startsWith('SDN:L05::'))).to.be.true();
    });
  });
});
