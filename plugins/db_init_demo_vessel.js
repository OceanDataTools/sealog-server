const {
  cruisesTable,
  eventAuxDataTable,
  eventsTable,
  eventTemplatesTable,
  usersTable
} = require('../config/db_constants');

const { filePreProcessor } = require('../lib/utils');

exports.plugin = {
  name: 'db_init_demo_vehicle',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    console.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    console.info('Resetting database with demo datasets');
    console.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

    console.debug('Searching for Cruises Collection');
    let result = await db.listCollections({ name: cruisesTable }).toArray();

    if (result.length) {
      console.debug('Cruises Collection exists... dropping it!');
      try {
        await db.dropCollection(cruisesTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Cruises Collection');
    try {
      const collection = await db.createCollection(cruisesTable);
      const init_data = filePreProcessor('./demo/FKt230303_cruiseRecord.json', 'cruises');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.debug('Searching for Events Collection');
    result = await db.listCollections({ name: eventsTable }).toArray();

    if (result.length) {
      console.debug('Events Collection exists... dropping it!');
      try {
        await db.dropCollection(eventsTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Events Collection');
    try {
      const collection = await db.createCollection(eventsTable);

      const init_data = filePreProcessor('./demo/FKt230303_eventOnlyExport.json', 'events');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.debug('Searching for Event Aux Data Collection');
    result = await db.listCollections({ name: eventAuxDataTable }).toArray();

    if (result.length) {
      console.debug('Event Aux Data Collection exists... dropping it!');
      try {
        await db.dropCollection(eventAuxDataTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Event Aux Data Collection');
    try {
      const collection = await db.createCollection(eventAuxDataTable);

      console.debug('Creating index based on event_id field');
      await collection.createIndex({ event_id: 1 });

      const init_data = filePreProcessor('./demo/FKt230303_auxDataExport.json', 'event_aux_data');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.debug('Searching for Event Templates Collection');
    result = await db.listCollections({ name: eventTemplatesTable }).toArray();

    if (result.length) {
      console.debug('Event Templates Collection exists... dropping it!');
      try {
        await db.dropCollection(eventTemplatesTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Event Templates Collection');
    try {
      const collection = await db.createCollection(eventTemplatesTable);
      const init_data = filePreProcessor('./demo/FKt230303_eventTemplates.json', 'event_templates');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }


    console.debug('Searching for Users Collection');
    result = await db.listCollections({ name: usersTable }).toArray();

    if (result.length) {
      console.debug('Users Collection exists... dropping it!');
      try {
        await db.dropCollection(usersTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Users Collection');
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
