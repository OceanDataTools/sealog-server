const {
  eventAuxDataTable,
  eventsTable
} = require('../config/db_constants');

const {
  vocabulariesTable,
  vocabularyTermsTable
} = require('./vocabularies');

const {
  sequenceCountersTable,
  sequencesTable
} = require('./sequences');

// Indexes each collection should have. They're checked on every startup, not
// just when a collection is created, so databases from older versions (or
// restored without their indexes) get them too.
const collectionIndexes = {
  [eventsTable]: [
    { key: { ts: -1 } },
    // Looking up events by term ID. The term-in-use check (lib/vocabularies.js)
    // matches with an unanchored regex, which scans it (#184)
    { key: { 'event_options.event_option_notation': 1 } },
    // Finding events that already have a sequence ID (lib/sequences.js)
    { key: { 'event_options.event_option_name': 1, 'event_options.event_option_value': 1 } }
  ],
  [eventAuxDataTable]: [{ key: { event_id: 1 } }],
  [vocabulariesTable]: [{ key: { collection: 1 }, options: { unique: true } }],
  [vocabularyTermsTable]: [
    { key: { collection: 1, id: 1 }, options: { unique: true } },
    { key: { broader: 1 } }
  ],
  [sequencesTable]: [{ key: { name: 1 }, options: { unique: true } }],
  // Unique so concurrent first uses of a scope can't create two counters
  [sequenceCountersTable]: [{ key: { sequence: 1, scope_key: 1 }, options: { unique: true } }]
};

// The demo plugins drop and recreate these collections after the db_*
// plugins run, so they build the indexes themselves.
const demoMode = ['demo-vehicle', 'demo-vessel'].includes(process.env.NODE_ENV);
const demoRebuiltCollections = [eventsTable, eventAuxDataTable];

const sameKey = (indexKey, specKey) => {

  const indexFields = Object.keys(indexKey);
  const specFields = Object.keys(specKey);

  if (indexFields.length !== specFields.length || indexFields.some((field, i) => field !== specFields[i])) {
    return false;
  }

  // A single-field index supports sorts and ranges in either direction
  if (specFields.length === 1) {
    return [1, -1].includes(indexKey[specFields[0]]);
  }

  return specFields.every((field) => indexKey[field] === specKey[field]);
};

const indexProblems = (index, spec) => {

  const problems = [];

  if (index.hidden) {
    problems.push('hidden');
  }

  if (index.sparse) {
    problems.push('sparse');
  }

  if (index.partialFilterExpression) {
    problems.push('partial');
  }

  if (spec.options && spec.options.unique && !index.unique) {
    problems.push('not unique');
  }

  return problems;
};

const listIndexes = async (collection) => {

  try {
    return await collection.listIndexes().toArray();
  }
  catch (err) {
    // A collection that doesn't exist yet has no indexes; createIndex creates it
    if (err.code === 26) {
      return [];
    }

    throw err;
  }
};

// Make sure the collection has a usable index for spec. An existing index on
// the same key that can't be used is repaired rather than duplicated:
// a hidden index is unhidden, anything else is dropped and rebuilt under its
// existing name. Returns true if anything was changed.
const ensureIndex = async (db, collectionName, spec) => {

  const collection = db.collection(collectionName);
  const indexes = await listIndexes(collection);
  const matches = indexes.filter((index) => sameKey(index.key, spec.key));

  if (matches.some((index) => indexProblems(index, spec).length === 0)) {
    return false;
  }

  if (!matches.length) {
    console.log(`Creating ${collectionName} index ${JSON.stringify(spec.key)}`);
    await collection.createIndex(spec.key, spec.options);
    return true;
  }

  const hiddenOnly = matches.find((index) => indexProblems(index, spec).join() === 'hidden');
  if (hiddenOnly) {
    console.log(`Unhiding ${collectionName} index "${hiddenOnly.name}"`);
    await db.command({ collMod: collectionName, index: { name: hiddenOnly.name, hidden: false } });
    return true;
  }

  for (const index of matches) {
    console.log(`Dropping ${collectionName} index "${index.name}" (${indexProblems(index, spec).join(', ')}) so it can be rebuilt`);
    await collection.dropIndex(index.name);
  }

  console.log(`Rebuilding ${collectionName} index "${matches[0].name}" ${JSON.stringify(spec.key)}`);
  await collection.createIndex(spec.key, { ...spec.options, name: matches[0].name });
  return true;
};

const ensureCollectionIndexes = async (db, collectionName, specs = collectionIndexes[collectionName] || []) => {

  let changed = false;
  for (const spec of specs) {
    changed = await ensureIndex(db, collectionName, spec) || changed;
  }

  return changed;
};

// Index builds don't block reads or writes (MongoDB 4.2+), so don't hold up
// server startup waiting for them. A failed build is logged and the server
// keeps running; queries are just slower without the index. The returned
// promise never rejects.
const ensureCollectionIndexesInBackground = (db, collectionName) => {

  if (demoMode && demoRebuiltCollections.includes(collectionName)) {
    return Promise.resolve();
  }

  return ensureCollectionIndexes(db, collectionName)
    .then((changed) => {

      if (changed) {
        console.log(`Finished building ${collectionName} indexes`);
      }
    })
    .catch((err) => {

      console.error(`ERROR: could not build ${collectionName} indexes:`, err.message);
    });
};

module.exports = {
  collectionIndexes,
  ensureIndex,
  ensureCollectionIndexes,
  ensureCollectionIndexesInBackground
};
