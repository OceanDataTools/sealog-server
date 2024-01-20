const {
  eventsTable
} = require('../config/db_constants');

const {
  events_develDB_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_events',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Events Collection');
      const result = await db.listCollections({ name: eventsTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Events Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Events Collection already exists... we\'re dropping it.');
          await db.dropCollection(eventsTable);
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

    console.log('Creating Events Collection');
    try {
      const collection = await db.createCollection(eventsTable);

      if (env !== 'production' ) {
        try {
          console.log('Populating Events Collection');
          await collection.insertMany(events_develDB_data);

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
