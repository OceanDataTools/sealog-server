const {
  ensureCollectionIndexes,
  ensureCollectionIndexesInBackground
} = require('../lib/db_indexes');

const {
  loadSeedBundle,
  vocabulariesTable,
  vocabularyTermsTable
} = require('../lib/vocabularies');

exports.plugin = {
  name: 'db_populate_vocabularies',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    // Unlike the other db_* plugins, development/test mode doesn't reset these
    // collections: reloading the seed bundle on every start would be slow and
    // the vocabularies aren't test data.
    console.log('Searching for Vocabularies Collection');
    const result = await db.listCollections({ name: vocabulariesTable }).toArray();

    if (result.length) {
      console.log('Vocabularies Collection already exists... checking indexes.');
      ensureCollectionIndexesInBackground(db, vocabulariesTable);
      ensureCollectionIndexesInBackground(db, vocabularyTermsTable);
      return;
    }

    console.log('Creating Vocabularies Collection');
    try {
      await db.createCollection(vocabulariesTable);

      // Built before seeding: the seed upserts look terms up by collection/id
      await ensureCollectionIndexes(db, vocabulariesTable);
      await ensureCollectionIndexes(db, vocabularyTermsTable);
    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }

    // The server works without vocabularies, so a bad bundle doesn't stop it
    try {
      console.log('Loading vocabulary seed bundle');
      const reports = await loadSeedBundle(db);
      reports.forEach((report) => console.log(`Loaded ${report.collection} v${report.version}: ${report.term_count} terms`));
    }
    catch (err) {
      console.error('ERROR: could not load the vocabulary seed bundle:', err.message);
    }
  }
};
