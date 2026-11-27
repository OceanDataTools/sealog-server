const {
  cruisesTable,
  eventAuxDataTable,
  eventsTable,
  eventTemplatesTable,
  usersTable
} = require('../config/db_constants');

const { filePreProcessor } = require('../lib/utils');
const { ensureCollectionIndexes } = require('../lib/db_indexes');
const { sequenceCountersTable, sequencesTable } = require('../lib/sequences');
const DemoSequences = require('../demo/demo_sequences.json');

const DAY_MS = 24 * 60 * 60 * 1000;

// FKt230303 ended in 2023, and per-cruise sequences reject events outside a
// cruise, so the demo also has a cruise in progress: 30 days from the start
// of the day the database is reset
const currentCruise = () => {

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  return {
    cruise_id: 'FKt-DEMO',
    start_ts: start,
    stop_ts: new Date(start.getTime() + (30 * DAY_MS) - 1000),
    cruise_location: 'Demo',
    cruise_tags: [],
    cruise_hidden: false,
    cruise_additional_meta: {
      cruise_name: 'Sealog Demo Cruise',
      cruise_vessel: 'R/V Falkor (too)',
      cruise_pi: 'Demo PI',
      cruise_departure_location: 'San Juan, PR',
      cruise_arrival_location: 'San Juan, PR',
      cruise_description: 'A cruise in progress for logging events in the demo. It restarts whenever the demo database is reset.',
      cruise_files: []
    }
  };
};

exports.plugin = {
  name: 'db_init_demo_vehicle',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    console.log('Resetting database with demo datasets');
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

    console.log('Searching for Cruises Collection');
    let result = await db.listCollections({ name: cruisesTable }).toArray();

    if (result.length) {
      console.log('Cruises Collection exists... dropping it!');
      try {
        await db.dropCollection(cruisesTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Cruises Collection');
    try {
      const collection = await db.createCollection(cruisesTable);
      const init_data = filePreProcessor('./demo/FKt230303_cruiseRecord.json', 'cruises');
      await collection.insertMany([...init_data, currentCruise()]);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.log('Searching for Events Collection');
    result = await db.listCollections({ name: eventsTable }).toArray();

    if (result.length) {
      console.log('Events Collection exists... dropping it!');
      try {
        await db.dropCollection(eventsTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Events Collection');
    try {
      const collection = await db.createCollection(eventsTable);

      const init_data = filePreProcessor('./demo/FKt230303_eventOnlyExport.json', 'events');
      await collection.insertMany(init_data);
      await ensureCollectionIndexes(db, eventsTable);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.log('Searching for Event Aux Data Collection');
    result = await db.listCollections({ name: eventAuxDataTable }).toArray();

    if (result.length) {
      console.log('Event Aux Data Collection exists... dropping it!');
      try {
        await db.dropCollection(eventAuxDataTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Event Aux Data Collection');
    try {
      const collection = await db.createCollection(eventAuxDataTable);

      const init_data = filePreProcessor('./demo/FKt230303_auxDataExport.json', 'event_aux_data');
      await collection.insertMany(init_data);
      await ensureCollectionIndexes(db, eventAuxDataTable);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.log('Searching for Event Templates Collection');
    result = await db.listCollections({ name: eventTemplatesTable }).toArray();

    if (result.length) {
      console.log('Event Templates Collection exists... dropping it!');
      try {
        await db.dropCollection(eventTemplatesTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Event Templates Collection');
    try {
      const collection = await db.createCollection(eventTemplatesTable);
      const init_data = filePreProcessor('./demo/FKt230303_eventTemplates.json', 'event_templates');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    // Emptied rather than dropped: the sequences routes built their indexes
    // when they registered
    console.log('Resetting ID Sequences');
    try {
      await db.collection(sequenceCountersTable).deleteMany({});
      await db.collection(sequencesTable).deleteMany({});
      await db.collection(sequencesTable).insertMany(DemoSequences.map((sequence) => ({ ...sequence })));
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.log('Searching for Users Collection');
    result = await db.listCollections({ name: usersTable }).toArray();

    if (result.length) {
      console.log('Users Collection exists... dropping it!');
      try {
        await db.dropCollection(usersTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Users Collection');
    try {
      const collection = await db.createCollection(usersTable);
      const init_data = filePreProcessor('./demo/demo_users.json', 'users');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }
  }
};
