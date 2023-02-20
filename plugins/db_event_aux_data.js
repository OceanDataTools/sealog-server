const {
  eventAuxDataTable
} = require('../config/db_constants');

const {
  event_aux_data_develDB_data
} = require('../lib/db_init_data');

let env = process.env.NODE_ENV || 'development';
env = (env === 'test') ? 'development' : env;
env = (env === 'debug') ? 'production' : env;

exports.plugin = {
  name: 'db_populate_event_aux_data',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;

    try {
      console.log('Searching for Event Aux Data Collection');
      const result = await db.listCollections({ name: eventAuxDataTable }).toArray();
      if (result.length > 0 ) {
        if (env === 'production' ) {
          console.log('Event Aux Data Collection already exists... we\'re done here.');
          return;
        }

        try {
          console.log('Event Aux Data Collection already exists... we\'re dropping it.');
          await db.dropCollection(eventAuxDataTable);
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

    console.log('Creating Event Aux Data Collection');
    try {
      const collection = await db.createCollection(eventAuxDataTable);

      if (env !== 'production' ) {
        try {
          console.log('Populating Event Aux Data Collection');
          await collection.insertMany(event_aux_data_develDB_data);

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
