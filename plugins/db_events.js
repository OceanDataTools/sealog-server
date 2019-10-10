

const {
  eventsTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_events',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    // const ObjectID = server.mongo.ObjectID;

    console.log("Searching for Events Collection");
    try {
      const result = await db.listCollections({ name:eventsTable }).toArray();
      if (result.length > 0) {
        console.log("Collection already exists... we're done here.");
        return;
      }
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }

    console.log("Creating Events Collection");
    try {
      await db.createCollection(eventsTable);
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }
  }
};