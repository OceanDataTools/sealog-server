const {
  cruisesTable,
  eventAuxDataTable,
  eventsTable,
  eventTemplatesTable,
  loweringsTable,
  usersTable
} = require('../config/db_constants');

const { filePreProcessor } = require('../lib/utils');

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
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.log('Searching for Lowerings Collection');
    result = await db.listCollections({ name: loweringsTable }).toArray();

    if (result.length) {
      console.log('Lowerings Collection exists... dropping it!');
      try {
        await db.dropCollection(loweringsTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Lowerings Collection');
    try {
      const collection = await db.createCollection(loweringsTable);
      const init_data = filePreProcessor('./demo/FKt230303_S0492_loweringRecord.json', 'lowerings');
      await collection.insertMany(init_data);
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
      const init_data = filePreProcessor('./demo/FKt230303_S0492_eventOnlyExport.json', 'events');
      await collection.insertMany(init_data);
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

      console.log('Creating index based on event_id field');
      await collection.createIndex({ event_id: 1 });

      const init_data = filePreProcessor('./demo/FKt230303_S0492_auxDataExport.json', 'event_aux_data');
      await collection.insertMany(init_data);
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
      const init_data = filePreProcessor('./demo/FKt230303_S0492_eventTemplates.json', 'event_templates');
      await collection.insertMany(init_data);
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
