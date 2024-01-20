const {
  eventTemplatesTable
} = require('../config/db_constants');

const {
  event_templates_develDB_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_event_templates',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Event Templates Collection');
      const result = await db.listCollections({ name: eventTemplatesTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Event Templates Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Event Templates Collection already exists... we\'re dropping it.');
          await db.dropCollection(eventTemplatesTable);
        }
        catch (err) {
          console.log('DROP ERROR:', err.code);
          throw (err);
        }
      }
    }
    catch (err) {
      console.log('LIST ERROR:', err.code);
      throw (err);
    }

    console.log('Creating Event Templates Collection');
    try {
      const collection = await db.createCollection(eventTemplatesTable);

      if (env !== 'production' ) {
        try {
          console.log('Populating Event Templates Collection');
          await collection.insertMany(event_templates_develDB_data);

        }
        catch (err) {
          console.log('INSERT ERROR:', err.code);
          throw (err);
        }
      }

    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }

  }
};
