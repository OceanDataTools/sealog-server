const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const Fs = require('fs');
const Path = require('path');
const Vm = require('vm');
const { ObjectId } = require('mongodb');
const { ensureEventTimestampIndex } = require('../lib/db_indexes');

const { describe, it } = exports.lab = Lab.script();

// Exercise initialization without connecting to or resetting a real database.
const setup = (existing = false, indexes = [{ key: { _id: 1 }, name: '_id_' }]) => {

  const collections = new Map();
  const makeCollection = (initialIndexes) => ({
    indexes: initialIndexes.slice(),
    documents: [],
    listIndexes() {

      return { toArray: () => Promise.resolve(this.indexes) };
    },
    createIndex(key) {

      this.indexes.push({ key, name: 'ts_-1' });
      return Promise.resolve('ts_-1');
    },
    insertMany(documents) {

      this.documents.push(...documents);
      return Promise.resolve();
    }
  });
  if (existing) {
    collections.set('events', makeCollection(indexes));
    collections.get('events').documents.push({ _id: 'keep-me', ts: new Date(0) });
  }

  const db = {
    listCollections: ({ name }) => ({ toArray: () => Promise.resolve(collections.has(name) ? [{ name }] : []) }),
    collection: (name) => collections.get(name),
    dropCollection: (name) => Promise.resolve(collections.delete(name)),
    createCollection: (name) => {

      const collection = makeCollection([{ key: { _id: 1 }, name: '_id_' }]);
      collections.set(name, collection);
      return Promise.resolve(collection);
    }
  };
  return db;
};

const register = async (filename, db, env = 'production') => {

  const context = {
    exports: {},
    console: { log: () => {}, error: () => {} },
    process: { env: { NODE_ENV: env } },
    require: (name) => {

      if (name === '../lib/utils') {
        return { filePreProcessor: () => [{ _id: 'demo-event' }] };
      }

      if (name === '../config/db_constants') {
        return {
          eventsTable: 'events', cruisesTable: 'cruises', loweringsTable: 'lowerings',
          eventAuxDataTable: 'event_aux_data', eventTemplatesTable: 'event_templates', usersTable: 'users'
        };
      }

      if (name === '../lib/db_indexes') {
        return { ensureEventTimestampIndex };
      }

      throw new Error(`Unexpected dependency: ${name}`);
    }
  };
  Vm.runInNewContext(Fs.readFileSync(Path.join(__dirname, '../plugins', filename), 'utf8'), context);
  await context.exports.plugin.register({ mongo: { db, ObjectID: ObjectId } }, {});
};

describe('Event timestamp index initialization', () => {

  it('creates the timestamp index on a fresh production database', async () => {

    const db = setup();
    await register('db_events.js', db);
    expect(db.collection('events').indexes).to.include({ key: { ts: -1 }, name: 'ts_-1' });
  });

  for (const env of ['production', 'debug']) {
    it(`upgrades an existing ${env} collection without replacing data or indexes`, async () => {

      const db = setup(true);
      const original = db.collection('events');
      await register('db_events.js', db, env);
      await register('db_events.js', db, env);
      expect(db.collection('events')).to.shallow.equal(original);
      expect(original.documents).to.equal([{ _id: 'keep-me', ts: new Date(0) }]);
      expect(original.indexes).to.equal([
        { key: { _id: 1 }, name: '_id_' }, { key: { ts: -1 }, name: 'ts_-1' }
      ]);
    });
  }

  for (const direction of [1, -1]) {
    it(`reuses an existing timestamp index with direction ${direction} and a custom name`, async () => {

      const indexes = [{ key: { _id: 1 }, name: '_id_' }, { key: { ts: direction }, name: 'manual_ts' }];
      const db = setup(true, indexes);
      await register('db_events.js', db);
      expect(db.collection('events').indexes).to.equal(indexes);
    });
  }

  for (const index of [
    { key: { ts: -1 }, name: 'partial_ts', partialFilterExpression: { event_value: 'TEST' } },
    { key: { ts: -1 }, name: 'sparse_ts', sparse: true },
    { key: { ts: -1 }, name: 'hidden_ts', hidden: true },
    { key: { event_value: 1, ts: -1 }, name: 'compound_ts' }
  ]) {
    it(`does not treat ${index.name} as a full timestamp index`, async () => {

      const db = setup(true, [index]);
      await register('db_events.js', db);
      expect(db.collection('events').indexes).to.include({ key: { ts: -1 }, name: 'ts_-1' });
    });
  }

  for (const env of ['development', 'test']) {
    it(`recreates the timestamp index after a ${env} reset`, async () => {

      const db = setup(true);
      await register('db_events.js', db, env);
      expect(db.collection('events').documents).to.have.length(5);
      expect(db.collection('events').documents.some((doc) => doc._id === 'keep-me')).to.equal(false);
      expect(db.collection('events').indexes).to.include({ key: { ts: -1 }, name: 'ts_-1' });
    });
  }

  for (const filename of ['db_init_demo_vehicle.js', 'db_init_demo_vessel.js']) {
    it(`restores the timestamp index when ${filename} replaces the collection`, async () => {

      const db = setup(true);
      await register('db_events.js', db);
      await register(filename, db, 'demo');
      expect(db.collection('events').documents).to.equal([{ _id: 'demo-event' }]);
      expect(db.collection('events').indexes).to.include({ key: { ts: -1 }, name: 'ts_-1' });
    });
  }

  it('waits for index creation before initialization finishes', async () => {

    const db = setup(true);
    let finishIndex;
    let finished = false;
    db.collection('events').createIndex = () => {

      return new Promise((resolve) => {

        finishIndex = resolve;
      });
    };

    const pending = register('db_events.js', db).then(() => {

      finished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(finished).to.equal(false);
    finishIndex();
    await pending;
    expect(finished).to.equal(true);
  });

  it('propagates index build failures instead of completing startup', async () => {

    const db = setup(true);
    const failure = new Error('Index build failed');
    db.collection('events').createIndex = () => Promise.reject(failure);
    const error = await expect(register('db_events.js', db)).to.reject(Error, 'Index build failed');
    expect(error).to.shallow.equal(failure);
  });
});
