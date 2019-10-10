

const {
  eventAuxDataTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_event_aux_data',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    // const ObjectID = server.mongo.ObjectID;

    console.log("Searching for Event Aux Data Collection");
    try {
      const result = await db.listCollections({ name:eventAuxDataTable }).toArray();
      if (result.length > 0) {
        console.log("Collection already exists... we're done here.");
        return;
      }
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }

    console.log("Creating Event Aux Data Collection");
    try {
      await db.createCollection(eventAuxDataTable);
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }
  }
};