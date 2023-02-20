const {
  loweringsTable
} = require('../config/db_constants');

const {
  lowerings_develDB_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_lowerings',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Lowerings Collection');
      const result = await db.listCollections({ name: loweringsTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Lowerings Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Lowerings Collection already exists... we\'re dropping it.');
          await db.dropCollection(loweringsTable);
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

    console.log('Creating Lowerings Collection');
    try {
      const collection = await db.createCollection(loweringsTable);

      if (env !== 'production' ) {
        try {
          console.log('Populating Lowerings Collection');
          await collection.insertMany(lowerings_develDB_data);

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
