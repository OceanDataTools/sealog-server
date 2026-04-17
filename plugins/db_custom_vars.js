const {
  customVarsTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_custom_vars',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;
    const resetDB = ['development', 'test'].includes(process.env.NODE_ENV);

    const init_data = [
      {
        _id: new ObjectID('59810167212b348aed7fa9f5'),
        custom_var_name: 'asnapStatus',
        custom_var_value: 'Off'
      },
      {
        _id: new ObjectID('59810167212b348aed7fa9f6'),
        custom_var_name: 'freeSpaceInBytes',
        custom_var_value: '0'
      },
      {
        _id: new ObjectID('59810167212b348aed7fa9f7'),
        custom_var_name: 'freeSpacePercentage',
        custom_var_value: '0'
      }

    ];

    const result = await db.listCollections({ name: customVarsTable }).toArray();

    if (result.length) {
      if (!resetDB) {
        console.debug('Custom Vars Collection already exists... we\'re done here.');
        return;
      }

      console.debug('Custom Vars Collection exists... dropping it!');
      try {
        await db.dropCollection(customVarsTable);
      }
      catch (err) {
        console.error('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.debug('Creating Custom Vars Collection');
    try {
      const collection = await db.createCollection(customVarsTable);
      // console.debug('Populating Custom Vars Collection');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.error('CREATE ERROR:', err.code);
      throw (err);
    }
  }
};
