const Fs = require('fs');
const Path = require('path');
const Zlib = require('zlib');

const DbConstants = require('../config/db_constants');
const ServerSettings = require('../config/server_settings');
const { vocabularyBundle } = require('./validations');

// config/*.js files copied from older templates don't define these
const vocabulariesTable = DbConstants.vocabulariesTable || 'vocabularies';
const vocabularyTermsTable = DbConstants.vocabularyTermsTable || 'vocabulary_terms';
const vocabularyCollections = ServerSettings.vocabularyCollections || ['EL1', 'EL2', 'L05', 'L06', 'L22'];
const nvsUrl = (ServerSettings.nvsUrl || 'https://vocab.nerc.ac.uk/collection').replace(/\/+$/, '');
const localVocabularyPrefix = ServerSettings.localVocabularyPrefix || 'CV';

const seedBundlePath = Path.join(__dirname, '..', 'data', 'nvs_vocabularies.json.gz');

const NVS_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const NVS_FETCH_TIMEOUT = 180000;
const SOURCE_MAX_BYTES = 50 * 1024 * 1024;
const SOURCE_MAX_REDIRECTS = 5;

// JSON-LD literal ({ '@value': x }, x, or a list of either) -> string,
// preferring English when several languages are given.
const literal = (value) => {

  if (Array.isArray(value)) {
    const english = value.find((item) => item && typeof item === 'object' && (item['@language'] || 'en') === 'en');
    return english ? literal(english) : literal(value[0]);
  }

  if (value && typeof value === 'object') {
    return value['@value'] || '';
  }

  return value || '';
};

const asList = (value) => {

  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

// http://vocab.nerc.ac.uk/collection/L05/current/130/ -> SDN:L05::130
const uriToNotation = (uri) => {

  const parts = uri.replace(/\/+$/, '').split('/collection/');
  if (parts.length !== 2) {
    return null;
  }

  const bits = parts[1].split('/');
  return bits.length >= 3 ? `SDN:${bits[0]}::${bits[2]}` : null;
};

const linkedNotations = (value) => {

  return asList(value)
    .filter((link) => link && typeof link === 'object' && link['@id'])
    .map((link) => uriToNotation(link['@id']))
    .filter(Boolean)
    .sort();
};

// Convert an NVS collection (JSON-LD, nvs profile) into a vocabulary record
// with its terms. defaults fill in metadata the document doesn't give.
const parseNvsCollection = (collection, doc, defaults = {
  uri: `${nvsUrl}/${collection}/current/`,
  license: NVS_LICENSE,
  attribution: 'NERC Vocabulary Server (NVS), British Oceanographic Data Centre'
}) => {

  const vocabulary = {
    collection,
    title: collection,
    uri: defaults.uri,
    version: '',
    license: defaults.license,
    attribution: defaults.attribution,
    terms: []
  };

  for (const node of asList(doc && doc['@graph'])) {
    const types = asList(node['@type']);

    if (types.includes('skos:Concept')) {
      const notation = literal(node['skos:notation']);
      vocabulary.terms.push({
        id: notation.split('::').pop(),
        notation,
        uri: node['@id'],
        prefLabel: literal(node['skos:prefLabel']),
        altLabel: literal(node['skos:altLabel']),
        definition: literal(node['skos:definition']),
        deprecated: String(literal(node['owl:deprecated'])).toLowerCase() === 'true',
        replacedBy: linkedNotations(node['dc:isReplacedBy']),
        broader: linkedNotations(node['skos:broader'])
      });
    }
    else if (types.includes('skos:Collection')) {
      vocabulary.title = literal(node['dc:title']) || collection;
      vocabulary.uri = node['@id'] || vocabulary.uri;
      vocabulary.version = literal(node['owl:versionInfo']);
      vocabulary.license = (node['dc:license'] && node['dc:license']['@id']) || defaults.license;
      vocabulary.attribution = literal(node['dc:creator']) || vocabulary.attribution;
    }
  }

  if (!vocabulary.terms.length) {
    throw new Error(`No terms found in NVS collection ${collection}`);
  }

  return vocabulary;
};

const fetchNvsCollection = async (collection) => {

  const url = `${nvsUrl}/${collection}/current/?_profile=nvs&_mediatype=application/ld+json`;
  const response = await fetch(url, {
    headers: { Accept: 'application/ld+json' },
    signal: AbortSignal.timeout(NVS_FETCH_TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`NVS returned HTTP ${response.status} for ${collection}`);
  }

  return parseNvsCollection(collection, await response.json());
};

const LOCAL_SOURCE = 'local';
const URL_SOURCE = 'url';

const isLocal = (vocabulary) => vocabulary.source === LOCAL_SOURCE;

// Which terms an install shows is kept on the vocabulary record, separate from
// the terms, so refreshes and imports never change it.
const visibilityOf = (vocabulary) => vocabulary.visibility || { mode: 'hide_listed', terms: [] };

const isHidden = (visibility, id) => {

  return visibility.mode === 'show_only_listed' ? !visibility.terms.includes(id) : visibility.terms.includes(id);
};

const visibleTermsQuery = (visibility) => {

  return visibility.mode === 'show_only_listed' ? { id: { $in: visibility.terms } } : { id: { $nin: visibility.terms } };
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 'SDN:L22::TOOL0058' -> 'SDN:L22::'
const notationPrefix = (notation) => {

  const end = notation.indexOf('::');
  return end === -1 ? notation : notation.slice(0, end + 2);
};

// The notations recorded on event options (event_option_notation, see
// lib/event_notations.js). Checkbox notations are joined with ';'. Events are
// found by vocabulary prefix, so a whole vocabulary's notations don't go into
// one regex, then the notations are matched exactly.
const notationsUsedOnEvents = async (db, notations) => {

  if (!notations.length) {
    return new Set();
  }

  const prefixes = [...new Set(notations.map(notationPrefix))];
  const pattern = new RegExp(`(^|;)(${prefixes.map(escapeRegExp).join('|')})`);
  const used = await db.collection(DbConstants.eventsTable).aggregate([
    { $match: { 'event_options.event_option_notation': pattern } },
    { $unwind: '$event_options' },
    { $match: { 'event_options.event_option_notation': pattern } },
    { $project: { _id: 0, notation: { $split: ['$event_options.event_option_notation', ';'] } } },
    { $unwind: '$notation' },
    { $match: { notation: { $in: notations } } },
    { $group: { _id: '$notation' } }
  ]).toArray();

  return new Set(used.map((result) => result._id));
};

const updateTermCount = async (db, collection) => {

  const term_count = await db.collection(vocabularyTermsTable).countDocuments({ collection });
  await db.collection(vocabulariesTable).updateOne({ collection }, { $set: { term_count } });
  return term_count;
};

const updating = new Set();

// Replace the cached copy of a vocabulary and report what changed. New and
// updated terms are written before removed ones are deleted, so the cache is
// never left empty; a refresh that fails while fetching or parsing never
// reaches this point. A removed term that's recorded on events is kept and
// marked deprecated so those events still resolve.
const applyVocabulary = async (db, vocabulary, source) => {

  const { collection, terms } = vocabulary;

  if (updating.has(collection)) {
    const err = new Error(`Vocabulary ${collection} is already being updated`);
    err.code = 'VOCABULARY_BUSY';
    throw err;
  }

  updating.add(collection);
  try {
    const termsCollection = db.collection(vocabularyTermsTable);
    const previousVocabulary = await db.collection(vocabulariesTable).findOne({ collection });
    const previousTerms = await termsCollection.find({ collection }, { projection: { _id: 0, id: 1, notation: 1, prefLabel: 1, deprecated: 1, source_removed: 1 } }).toArray();
    const previousById = new Map(previousTerms.map((term) => [term.id, term]));
    const newIds = new Set(terms.map((term) => term.id));

    const added = terms.filter((term) => !previousById.has(term.id)).map((term) => term.notation);
    const deprecated = terms.filter((term) => term.deprecated && previousById.has(term.id) && !previousById.get(term.id).deprecated).map((term) => term.notation);
    const missing = previousTerms.filter((term) => !newIds.has(term.id) && !term.source_removed);
    const used = await notationsUsedOnEvents(db, missing.map((term) => term.notation));
    const removed = missing.filter((term) => !used.has(term.notation));
    const retained = missing.filter((term) => used.has(term.notation));

    await termsCollection.bulkWrite(terms.map((term) => ({
      replaceOne: { filter: { collection, id: term.id }, replacement: { ...term, collection }, upsert: true }
    })), { ordered: false });

    if (removed.length) {
      await termsCollection.deleteMany({ collection, id: { $in: removed.map((term) => term.id) } });
    }

    if (retained.length) {
      await termsCollection.updateMany({ collection, id: { $in: retained.map((term) => term.id) } }, { $set: { deprecated: true, source_removed: true } });
    }

    // $set, not replace: the record also holds this install's visibility
    // Hand-written bundles may leave the optional fields out
    const record = {
      collection,
      title: vocabulary.title || collection,
      uri: vocabulary.uri || '',
      version: vocabulary.version || '',
      fetched: vocabulary.fetched || new Date().toISOString(),
      source,
      license: vocabulary.license || '',
      attribution: vocabulary.attribution || ''
    };

    if (vocabulary.prefix) {
      record.prefix = vocabulary.prefix;
    }

    const update = { $set: record };
    if (source === URL_SOURCE) {
      record.source_url = vocabulary.source_url;
    }
    else {
      update.$unset = { source_url: '' };
    }

    await db.collection(vocabulariesTable).updateOne({ collection }, update, { upsert: true });
    record.term_count = await updateTermCount(db, collection);

    // Template options listing deprecated or removed terms
    const flagged = new Map(terms.filter((term) => term.deprecated).map((term) => [term.id, { term, status: 'deprecated', replaced_by: term.replacedBy }]));
    [...removed, ...retained].forEach((term) => flagged.set(term.id, { term, status: 'removed', replaced_by: [] }));

    const affected_templates = [];
    if (flagged.size) {
      const listing = optionsListing(await templatesUsing(db, collection), collection, [...flagged.keys()]);
      listing.forEach(({ id, ...option }) => {

        const { term, status, replaced_by } = flagged.get(id);
        affected_templates.push({ ...option, value: term.prefLabel || id, notation: term.notation, status, replaced_by });
      });
    }

    return {
      collection,
      version: record.version,
      previous_version: previousVocabulary ? previousVocabulary.version : null,
      source,
      term_count: record.term_count,
      added,
      deprecated,
      removed: removed.map((term) => term.notation),
      retained: retained.map((term) => term.notation),
      affected_templates
    };
  }
  finally {
    updating.delete(collection);
  }
};

const exportBundle = async (db, collections) => {

  const query = collections ? { collection: { $in: collections } } : {};
  // Visibility is per install and the source URL belongs to whichever server
  // pulls the bundle, so neither is exported
  const records = await db.collection(vocabulariesTable).find(query, { projection: { _id: 0, visibility: 0, source_url: 0 } }).sort({ collection: 1 }).toArray();

  for (const record of records) {
    record.terms = await db.collection(vocabularyTermsTable)
      .find({ collection: record.collection }, { projection: { _id: 0, collection: 0 } })
      .sort({ id: 1 })
      .toArray();
  }

  return {
    format: 'sealog-vocabularies',
    format_version: 1,
    exported: new Date().toISOString(),
    vocabularies: records
  };
};

// Load the vocabulary bundle shipped with the server, so installs without
// internet access have the configured collections from the first start.
const loadSeedBundle = async (db, bundlePath = seedBundlePath) => {

  const bundle = JSON.parse(Zlib.gunzipSync(Fs.readFileSync(bundlePath)));
  const reports = [];

  for (const vocabulary of bundle.vocabularies) {
    if (vocabularyCollections.includes(vocabulary.collection)) {
      reports.push(await applyVocabulary(db, vocabulary, 'seed'));
    }
  }

  return reports;
};

const vocabularyError = (code, message) => {

  const err = new Error(message);
  err.code = code;
  return err;
};

// Read at request time (not at load) so it can be changed in tests
const sourceHosts = () => (ServerSettings.vocabularySourceHosts || []).map((host) => host.toLowerCase());

const hostAllowed = (hostname) => {

  return sourceHosts().some((entry) => (entry.startsWith('*.') ? hostname.endsWith(entry.slice(1)) : hostname === entry));
};

// Vocabulary sources are fetched by the server, so only http(s) URLs on hosts
// in the vocabularySourceHosts setting are allowed. Throws
// VOCABULARY_SOURCE_REFUSED otherwise.
const checkSourceUrl = (url) => {

  let parsed;
  try {
    parsed = new URL(url);
  }
  catch (err) {
    throw vocabularyError('VOCABULARY_SOURCE_REFUSED', `Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw vocabularyError('VOCABULARY_SOURCE_REFUSED', `Only http and https URLs are allowed: ${url}`);
  }

  if (!sourceHosts().length) {
    throw vocabularyError('VOCABULARY_SOURCE_REFUSED', 'Vocabulary sources are disabled on this server (the vocabularySourceHosts setting is empty)');
  }

  if (!hostAllowed(parsed.hostname.toLowerCase())) {
    throw vocabularyError('VOCABULARY_SOURCE_REFUSED', `${parsed.hostname} is not in the vocabularySourceHosts setting`);
  }

  return parsed;
};

// The response body, refusing anything over SOURCE_MAX_BYTES. Gzipped files
// (e.g. a hosted .json.gz bundle) are decompressed.
const readSourceBody = async (response) => {

  const chunks = [];
  let size = 0;

  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      size += value.length;
      if (size > SOURCE_MAX_BYTES) {
        await reader.cancel();
        throw new Error(`response is larger than ${SOURCE_MAX_BYTES / 1024 / 1024} MB`);
      }

      chunks.push(value);
    }
  }

  const body = Buffer.concat(chunks);
  return body[0] === 0x1f && body[1] === 0x8b ? Zlib.gunzipSync(body) : body;
};

// Fetch a vocabulary from a URL: either a Sealog vocabulary bundle (its
// vocabulary with this collection code) or an NVS-style SKOS JSON-LD
// collection.
const fetchVocabularySource = async (collection, url) => {

  let current = checkSourceUrl(url);
  let response;

  for (let i = 0; ; ++i) {
    response = await fetch(current, {
      headers: { Accept: 'application/json, application/ld+json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(NVS_FETCH_TIMEOUT)
    });

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    if (i >= SOURCE_MAX_REDIRECTS) {
      throw new Error(`too many redirects from ${url}`);
    }

    // Every redirect has to stay on an allowed host
    current = checkSourceUrl(new URL(response.headers.get('location'), current).href);
  }

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  const body = await readSourceBody(response);
  let doc;
  try {
    doc = JSON.parse(body);
  }
  catch (err) {
    throw new Error(`${url} is not JSON (${err.message})`);
  }

  if (doc && doc.format === 'sealog-vocabularies') {
    const { error } = vocabularyBundle.validate(doc);
    if (error) {
      throw new Error(`invalid vocabulary bundle at ${url}: ${error.message}`);
    }

    const vocabulary = doc.vocabularies.find((item) => item.collection === collection);
    if (!vocabulary) {
      throw new Error(`the bundle at ${url} has no ${collection} vocabulary (it has ${doc.vocabularies.map((item) => item.collection).join(', ')})`);
    }

    return { ...vocabulary, source_url: url };
  }

  return { ...parseNvsCollection(collection, doc, { uri: url, license: '', attribution: '' }), source_url: url };
};

const createLocalVocabulary = async (db, { collection, title, prefix }) => {

  const record = {
    collection,
    title,
    uri: '',
    version: '',
    fetched: new Date().toISOString(),
    term_count: 0,
    source: LOCAL_SOURCE,
    prefix: prefix || localVocabularyPrefix,
    license: '',
    attribution: ''
  };

  try {
    await db.collection(vocabulariesTable).insertOne(record);
  }
  catch (err) {
    if (err.code === 11000) {
      throw vocabularyError('VOCABULARY_EXISTS', `Vocabulary ${collection} already exists`);
    }

    throw err;
  }

  delete record._id;
  return record;
};

const addLocalTerm = async (db, vocabulary, fields) => {

  const term = {
    collection: vocabulary.collection,
    id: fields.id,
    notation: `${vocabulary.prefix}:${vocabulary.collection}::${fields.id}`,
    uri: '',
    prefLabel: fields.prefLabel,
    altLabel: fields.altLabel || '',
    definition: fields.definition || '',
    deprecated: false,
    replacedBy: [],
    broader: fields.broader || []
  };

  try {
    await db.collection(vocabularyTermsTable).insertOne(term);
  }
  catch (err) {
    if (err.code === 11000) {
      throw vocabularyError('TERM_EXISTS', `Term ${vocabulary.collection}::${fields.id} already exists`);
    }

    throw err;
  }

  await updateTermCount(db, vocabulary.collection);
  delete term._id;
  return term;
};

// Delete a local term, or deprecate it if it's recorded on events
const removeLocalTerm = async (db, vocabulary, term) => {

  const used = await notationsUsedOnEvents(db, [term.notation]);
  const query = { collection: vocabulary.collection, id: term.id };

  if (used.size) {
    await db.collection(vocabularyTermsTable).updateOne(query, { $set: { deprecated: true } });
    return 'deprecated';
  }

  await db.collection(vocabularyTermsTable).deleteOne(query);
  await updateTermCount(db, vocabulary.collection);
  return 'deleted';
};

// Delete a vocabulary and its terms. Terms recorded on events are kept,
// marked deprecated, with the vocabulary record, so those events still
// resolve; a later refresh brings a source's terms back. Returns the kept
// notations (none when the vocabulary was deleted), or null if there's no
// such vocabulary.
const removeVocabulary = async (db, collection) => {

  if (updating.has(collection)) {
    throw vocabularyError('VOCABULARY_BUSY', `Vocabulary ${collection} is being updated`);
  }

  updating.add(collection);
  try {
    const vocabulary = await db.collection(vocabulariesTable).findOne({ collection });
    if (!vocabulary) {
      return null;
    }

    const termsCollection = db.collection(vocabularyTermsTable);
    const terms = await termsCollection.find({ collection }, { projection: { _id: 0, notation: 1 } }).toArray();
    const used = await notationsUsedOnEvents(db, terms.map((term) => term.notation));

    if (!used.size) {
      await db.collection(vocabulariesTable).deleteOne({ collection });
      await termsCollection.deleteMany({ collection });
      return [];
    }

    const kept = [...used].sort();
    await termsCollection.deleteMany({ collection, notation: { $nin: kept } });
    // As for a single local term delete or a term a refresh drops
    await termsCollection.updateMany({ collection }, { $set: isLocal(vocabulary) ? { deprecated: true } : { deprecated: true, source_removed: true } });
    await updateTermCount(db, collection);
    return kept;
  }
  finally {
    updating.delete(collection);
  }
};

// Templates with an option referencing the collection
const templatesUsing = (db, collection) => {

  return db.collection(DbConstants.eventTemplatesTable).find({ 'event_options.event_option_vocab.collection': collection }).toArray();
};

// Options that list any of the term IDs explicitly
const optionsListing = (templates, collection, ids) => {

  const found = [];
  for (const template of templates) {
    for (const option of template.event_options) {
      const vocab = option.event_option_vocab;
      if (!vocab || vocab.collection !== collection || !vocab.terms) {
        continue;
      }

      for (const id of vocab.terms.filter((termId) => ids.includes(termId))) {
        found.push({
          template_id: template._id.toString(),
          event_name: template.event_name,
          event_option_name: option.event_option_name,
          id
        });
      }
    }
  }

  return found;
};

const setVisibility = async (db, collection, visibility) => {

  const normalized = { mode: visibility.mode, terms: [...new Set(visibility.terms)].sort() };
  await db.collection(vocabulariesTable).updateOne({ collection }, { $set: { visibility: normalized } });
  return normalized;
};

const setTermHidden = (db, vocabulary, id, hidden) => {

  const visibility = visibilityOf(vocabulary);
  const listed = visibility.mode === 'show_only_listed' ? !hidden : hidden;
  const terms = listed ? [...visibility.terms, id] : visibility.terms.filter((term) => term !== id);

  return setVisibility(db, vocabulary.collection, { mode: visibility.mode, terms });
};

module.exports = {
  LOCAL_SOURCE,
  URL_SOURCE,
  vocabulariesTable,
  vocabularyTermsTable,
  vocabularyCollections,
  seedBundlePath,
  parseNvsCollection,
  fetchNvsCollection,
  fetchVocabularySource,
  applyVocabulary,
  exportBundle,
  loadSeedBundle,
  isLocal,
  visibilityOf,
  isHidden,
  visibleTermsQuery,
  createLocalVocabulary,
  addLocalTerm,
  removeLocalTerm,
  removeVocabulary,
  setVisibility,
  setTermHidden,
  templatesUsing,
  optionsListing
};
