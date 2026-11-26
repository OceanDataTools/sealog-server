#!/usr/bin/env node
// Rebuild data/nvs_vocabularies.json.gz, the vocabulary bundle loaded the
// first time the server starts, from the NERC Vocabulary Server.
//
//   npm run build-vocabulary-seed [-- EL1 EL2 ...]
//
// Defaults to the collections in the default vocabularyCollections setting.

const Fs = require('fs');
const Zlib = require('zlib');

const { fetchNvsCollection, seedBundlePath } = require('../lib/vocabularies');

const DEFAULT_COLLECTIONS = ['EL1', 'EL2', 'L05', 'L06', 'L22'];

const main = async () => {

  const collections = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_COLLECTIONS;
  const vocabularies = [];

  for (const collection of collections) {
    console.log(`Fetching ${collection} from NVS...`);
    const vocabulary = await fetchNvsCollection(collection);
    vocabulary.fetched = new Date().toISOString();
    console.log(`  ${vocabulary.title} v${vocabulary.version}: ${vocabulary.terms.length} terms`);
    vocabularies.push(vocabulary);
  }

  const bundle = {
    format: 'sealog-vocabularies',
    format_version: 1,
    exported: new Date().toISOString(),
    vocabularies
  };

  Fs.writeFileSync(seedBundlePath, Zlib.gzipSync(JSON.stringify(bundle), { level: 9 }));
  console.log(`Wrote ${seedBundlePath} (${(Fs.statSync(seedBundlePath).size / 1e6).toFixed(2)} MB)`);
};

main().catch((err) => {

  console.error(err.message);
  process.exit(1);
});
