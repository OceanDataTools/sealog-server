'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { before, after, beforeEach, describe, it } = exports.lab = Lab.script();
const { init } = require('../lib/server');
const { eventAuxDataTable, eventsTable } = require('../config/db_constants');
const {
  collectionIndexes,
  ensureIndex,
  ensureCollectionIndexesInBackground
} = require('../lib/db_indexes');

// Runs against the real test database: MongoDB, not a fake, decides which
// index combinations are allowed.
describe('DB index helper', () => {
  let server;
  let db;
  let collection;

  const testTable = 'db_indexes_test';
  const tsSpec = { key: { ts: -1 } };

  const tsIndexes = async () => {

    const indexes = await collection.listIndexes().toArray();
    return indexes.filter((index) => index.key.ts !== undefined);
  };

  before(async () => {
    server = await init();
    db = server.mongo.db;
  });

  after(async () => {
    await db.collection(testTable).drop().catch(() => {});
    await server.stop();
  });

  beforeEach(async () => {
    await db.collection(testTable).drop().catch(() => {});
    collection = await db.createCollection(testTable);
    await collection.insertMany([
      { ts: new Date('2024-01-01T00:00:00Z'), event_value: 'A' },
      { ts: new Date('2024-01-02T00:00:00Z') }
    ]);
  });

  it('defines the events and aux data indexes', () => {
    expect(collectionIndexes[eventsTable]).to.equal([{ key: { ts: -1 } }]);
    expect(collectionIndexes[eventAuxDataTable]).to.equal([{ key: { event_id: 1 } }, { key: { data_source: 1, 'data_array.data_value': 1 } }]);
  });

  it('creates the index when there is none', async () => {
    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.length).to.equal(1);
    expect(indexes[0].name).to.equal('ts_-1');
  });

  it('creates the index on a collection that does not exist yet', async () => {
    await db.collection(testTable).drop();

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.map((index) => index.name)).to.equal(['ts_-1']);
  });

  it('reuses a full index with another name and direction', async () => {
    await collection.createIndex({ ts: 1 }, { name: 'my_ts' });

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.false();

    const indexes = await tsIndexes();
    expect(indexes.map((index) => index.name)).to.equal(['my_ts']);
  });

  it('unhides a hidden index instead of creating another', async () => {
    await collection.createIndex({ ts: -1 }, { name: 'my_ts', hidden: true });

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.length).to.equal(1);
    expect(indexes[0].name).to.equal('my_ts');
    expect(indexes[0].hidden).to.not.be.true();
  });

  it('rebuilds a sparse index with the default name as a full index', async () => {
    await collection.createIndex({ ts: -1 }, { sparse: true });

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.length).to.equal(1);
    expect(indexes[0].name).to.equal('ts_-1');
    expect(indexes[0].sparse).to.not.be.true();
  });

  it('rebuilds a partial index under its existing name', async () => {
    await collection.createIndex({ ts: -1 }, { name: 'my_ts', partialFilterExpression: { event_value: { $exists: true } } });

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.length).to.equal(1);
    expect(indexes[0].name).to.equal('my_ts');
    expect(indexes[0].partialFilterExpression).to.not.exist();
  });

  it('replaces a hidden sparse index with one full index', async () => {
    await collection.createIndex({ ts: 1 }, { name: 'my_ts', sparse: true, hidden: true });

    expect(await ensureIndex(db, testTable, tsSpec)).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.length).to.equal(1);
    expect(indexes[0].name).to.equal('my_ts');
    expect(indexes[0].key).to.equal({ ts: -1 });
    expect(indexes[0].sparse).to.not.be.true();
    expect(indexes[0].hidden).to.not.be.true();
  });

  it('rebuilds a non-unique index when the spec requires unique', async () => {
    await collection.createIndex({ event_value: 1 }, { name: 'value' });
    await collection.deleteMany({ event_value: { $exists: false } });

    expect(await ensureIndex(db, testTable, { key: { event_value: 1 }, options: { unique: true } })).to.be.true();

    const indexes = await collection.listIndexes().toArray();
    const valueIndexes = indexes.filter((index) => index.key.event_value !== undefined);
    expect(valueIndexes.length).to.equal(1);
    expect(valueIndexes[0].name).to.equal('value');
    expect(valueIndexes[0].unique).to.be.true();
  });

  it('does not match a compound index with different directions', async () => {
    await collection.createIndex({ ts: 1, event_value: 1 });

    expect(await ensureIndex(db, testTable, { key: { ts: 1, event_value: -1 } })).to.be.true();

    const indexes = await tsIndexes();
    expect(indexes.map((index) => index.name).sort()).to.equal(['ts_1_event_value_-1', 'ts_1_event_value_1']);
  });

  it('logs a failed background build instead of rejecting', async () => {
    collectionIndexes[testTable] = [{ key: { event_value: 1 }, options: { unique: true } }];
    await collection.insertOne({ ts: new Date(), event_value: 'A' });

    try {
      await ensureCollectionIndexesInBackground(db, testTable);
    }
    finally {
      delete collectionIndexes[testTable];
    }

    const indexes = await collection.listIndexes().toArray();
    expect(indexes.some((index) => index.key.event_value !== undefined)).to.be.false();
  });
});
