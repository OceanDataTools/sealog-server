const {
  customVarsTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_custom_vars',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const init_data = [
      {
        _id: ObjectID('59810167212b348aed7fa9f5'),
        custom_var_name: 'asnapStatus',
        custom_var_value: 'Off'
      },
      {
        _id: ObjectID('59810167212b348aed7fa9f6'),
        custom_var_name: 'freeSpaceInBytes',
        custom_var_value: '0'
      },
      {
        _id: ObjectID('59810167212b348aed7fa9f7'),
        custom_var_name: 'freeSpacePercentage',
        custom_var_value: '0'
      }

    ];

    console.log('Searching for Custom Variable Collection');
    try {
      const result = await db.listCollections({ name: customVarsTable }).toArray();
      if (result.length > 0) {
        console.log('Collection already exists... we\'re done here.');
        return;
      }
    }
    catch (err) {
      console.log('ERROR:', err.code);
      throw (err);
    }

    try {
      console.log('Creating Custom Variable Collection');
      const collection = await db.createCollection(customVarsTable);

      console.log('Populating Custom Variable Collection');
      await collection.insertMany(init_data);

    }
    catch (err) {
      console.log('ERROR:', err.code);
      throw (err);
    }
  }
};
