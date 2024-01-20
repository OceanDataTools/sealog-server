const {
  customVarsTable
} = require('../config/db_constants');

const {
  custom_vars_init_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_custom_vars',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Custom Vars Collection');
      const result = await db.listCollections({ name: customVarsTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Custom Vars Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Custom Vars Collection already exists... we\'re dropping it.');
          await db.dropCollection(customVarsTable);
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

    console.log('Creating Custom Vars Collection');
    try {
      const collection = await db.createCollection(customVarsTable);

      try {
        console.log('Populating Custom Vars Collection');
        await collection.insertMany(custom_vars_init_data);

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
