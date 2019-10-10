

const {
  loweringsTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_lowerings',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    // const ObjectID = server.mongo.ObjectID;

    console.log("Searching for Lowerings Collection");
    try {
      const result = await db.listCollections({ name:loweringsTable }).toArray();
      if (result.length > 0) {
        console.log("Collection already exists... we're done here.");
        return;
      }
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }

    console.log("Creating Lowerings Collection");
    try {
      await db.createCollection(loweringsTable);
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }
  }
};