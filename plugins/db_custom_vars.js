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

    console.log('Searching for Custom Vars Collection');
    const result = await db.listCollections({ name: customVarsTable }).toArray();

    if (result.length) {
      if (process.env.NODE_ENV !== 'development') {
        console.log('Custom Vars Collection already exists... we\'re done here.');
        return;
      }

      console.log('Custom Vars Collection exists... dropping it!');
      try {
        await db.dropCollection(customVarsTable);
      }
      catch (err) {
        console.log('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Custom Vars Collection');
    try {
      const collection = await db.createCollection(customVarsTable);
      console.log('Populating Custom Vars Collection');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }
  }
};
