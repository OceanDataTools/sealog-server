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

const updating = new Set();

// Replace the cached copy of a vocabulary and report what changed. New and
// updated terms are written before removed ones are deleted, so the cache is
// never left empty; a refresh that fails while fetching or parsing never
// reaches this point.
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
    const previousTerms = await termsCollection.find({ collection }, { projection: { _id: 0, id: 1, notation: 1, deprecated: 1 } }).toArray();
    const previousById = new Map(previousTerms.map((term) => [term.id, term]));
    const newIds = new Set(terms.map((term) => term.id));

    const added = terms.filter((term) => !previousById.has(term.id)).map((term) => term.notation);
    const deprecated = terms.filter((term) => term.deprecated && previousById.has(term.id) && !previousById.get(term.id).deprecated).map((term) => term.notation);
    const removed = previousTerms.filter((term) => !newIds.has(term.id));

    await termsCollection.bulkWrite(terms.map((term) => ({
      replaceOne: { filter: { collection, id: term.id }, replacement: { ...term, collection }, upsert: true }
    })), { ordered: false });

    if (removed.length) {
      await termsCollection.deleteMany({ collection, id: { $in: removed.map((term) => term.id) } });
    }

    const record = {
      collection,
      title: vocabulary.title,
      uri: vocabulary.uri,
      version: vocabulary.version,
      fetched: vocabulary.fetched || new Date().toISOString(),
      term_count: terms.length,
      source,
      license: vocabulary.license,
      attribution: vocabulary.attribution
    };
    await db.collection(vocabulariesTable).replaceOne({ collection }, record, { upsert: true });

    // Templates whose options map values to deprecated or removed terms
    const flagged = new Map(terms.filter((term) => term.deprecated).map((term) => [term.notation, { status: 'deprecated', replaced_by: term.replacedBy }]));
    removed.forEach((term) => flagged.set(term.notation, { status: 'removed', replaced_by: [] }));

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
      affected_templates
    };
  }
  finally {
    updating.delete(collection);
  }
};

const exportBundle = async (db, collections) => {

  const query = collections ? { collection: { $in: collections } } : {};
  const records = await db.collection(vocabulariesTable).find(query, { projection: { _id: 0 } }).sort({ collection: 1 }).toArray();

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

module.exports = {
  vocabulariesTable,
  vocabularyTermsTable,
  vocabularyCollections,
  seedBundlePath,
  parseNvsCollection,
  fetchNvsCollection,
  applyVocabulary,
  exportBundle,
  loadSeedBundle
};
