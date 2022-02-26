const {
  cruisesTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_cruises',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    // const ObjectID = server.mongo.ObjectID;

    console.log('Searching for Cruises Collection');
    try {
      const result = await db.listCollections({ name: cruisesTable }).toArray();
      if (result.length > 0 ) {
        console.log('Collection already exists... we\'re done here.');
        return;
      }
    }
    catch (err) {
      console.log('ERROR:', err.code);
      throw (err);
    }

    console.log('Creating Cruises Collection');
    try {
      await db.createCollection(cruisesTable);
    }
    catch (err) {
      console.log('ERROR:', err.code);
      throw (err);
    }
  }
};
