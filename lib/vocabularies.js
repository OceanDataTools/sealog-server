const Fs = require('fs');
const Path = require('path');
const Zlib = require('zlib');

const DbConstants = require('../config/db_constants');
const ServerSettings = require('../config/server_settings');

// config/*.js files copied from older templates don't define these
const vocabulariesTable = DbConstants.vocabulariesTable || 'vocabularies';
const vocabularyTermsTable = DbConstants.vocabularyTermsTable || 'vocabulary_terms';
const vocabularyCollections = ServerSettings.vocabularyCollections || ['EL1', 'EL2', 'L05', 'L06', 'L22'];
const nvsUrl = (ServerSettings.nvsUrl || 'https://vocab.nerc.ac.uk/collection').replace(/\/+$/, '');
const localVocabularyPrefix = ServerSettings.localVocabularyPrefix || 'CV';

const seedBundlePath = Path.join(__dirname, '..', 'data', 'nvs_vocabularies.json.gz');

const NVS_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const NVS_FETCH_TIMEOUT = 180000;

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
// with its terms.
const parseNvsCollection = (collection, doc) => {

  const vocabulary = {
    collection,
    title: collection,
    uri: `${nvsUrl}/${collection}/current/`,
    version: '',
    license: NVS_LICENSE,
    attribution: 'NERC Vocabulary Server (NVS), British Oceanographic Data Centre',
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
      vocabulary.license = (node['dc:license'] && node['dc:license']['@id']) || NVS_LICENSE;
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
const VOCAB_DATA_SOURCE = 'vocab';

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

// The notations recorded on events (as 'vocab' aux_data, see lib/vocab_aux_data.js)
const notationsUsedOnEvents = async (db, notations) => {

  if (!notations.length) {
    return new Set();
  }

  const used = await db.collection(DbConstants.eventAuxDataTable).distinct('data_array.data_value', {
    data_source: VOCAB_DATA_SOURCE,
    'data_array.data_value': { $in: notations }
  });

  return new Set(used.filter((notation) => notations.includes(notation)));
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
    const previousTerms = await termsCollection.find({ collection }, { projection: { _id: 0, id: 1, notation: 1, deprecated: 1, source_removed: 1 } }).toArray();
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
    const record = {
      collection,
      title: vocabulary.title,
      uri: vocabulary.uri,
      version: vocabulary.version,
      fetched: vocabulary.fetched || new Date().toISOString(),
      source,
      license: vocabulary.license,
      attribution: vocabulary.attribution
    };

    if (vocabulary.prefix) {
      record.prefix = vocabulary.prefix;
    }

    await db.collection(vocabulariesTable).updateOne({ collection }, { $set: record }, { upsert: true });
    record.term_count = await updateTermCount(db, collection);

    // Templates whose options map values to deprecated or removed terms
    const flagged = new Map(terms.filter((term) => term.deprecated).map((term) => [term.notation, { status: 'deprecated', replaced_by: term.replacedBy }]));
    [...removed, ...retained].forEach((term) => flagged.set(term.notation, { status: 'removed', replaced_by: [] }));

    const affected_templates = [];
    if (flagged.size) {
      const templates = await db.collection(DbConstants.eventTemplatesTable).find({
        'event_options.event_option_vocab.terms.notation': { $in: [...flagged.keys()] }
      }).toArray();

      for (const template of templates) {
        for (const option of template.event_options) {
          for (const term of (option.event_option_vocab && option.event_option_vocab.terms) || []) {
            if (flagged.has(term.notation)) {
              affected_templates.push({
                template_id: template._id.toString(),
                event_name: template.event_name,
                event_option_name: option.event_option_name,
                value: term.value,
                notation: term.notation,
                ...flagged.get(term.notation)
              });
            }
          }
        }
      }
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
  // Visibility is per install, so it isn't exported
  const records = await db.collection(vocabulariesTable).find(query, { projection: { _id: 0, visibility: 0 } }).sort({ collection: 1 }).toArray();

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
  vocabulariesTable,
  vocabularyTermsTable,
  vocabularyCollections,
  seedBundlePath,
  parseNvsCollection,
  fetchNvsCollection,
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
  setVisibility,
  setTermHidden
};
