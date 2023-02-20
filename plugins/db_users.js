const {
  usersTable
} = require('../config/db_constants');

const {
  users_init_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_users',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Users Collection');
      const result = await db.listCollections({ name: usersTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Users Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Users Collection already exists... we\'re dropping it.');
          await db.dropCollection(usersTable);
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

    console.log('Creating Users Collection');
    try {
      const collection = await db.createCollection(usersTable);

      try {
        console.log('Populating Users Collection');
        await collection.insertMany(users_init_data);

      }
      catch (err) {
        console.log('INSERT ERROR:', err.code);
        throw (err);
      }
    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }

  }
};
