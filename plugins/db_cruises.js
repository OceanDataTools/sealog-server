const {
  cruisesTable
} = require('../config/db_constants');

const {
  cruises_develDB_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_cruises',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Cruises Collection');
      const result = await db.listCollections({ name: cruisesTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Cruise Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Cruise Collection already exists... we\'re dropping it.');
          await db.dropCollection(cruisesTable);
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

    console.log('Creating Cruises Collection');
    try {
      const collection = await db.createCollection(cruisesTable);

      if (env !== 'production' ) {
        try {
          console.log('Populating Cruises Collection');
          await collection.insertMany(cruises_develDB_data);

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
