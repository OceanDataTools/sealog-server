const { hashedApiKey } = require('../lib/utils');

const {
  apiKeysTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_apikeys',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const init_data = [
      {
        _id: ObjectID('5981f167212b348ae32fa9f5'),
        user_id: ObjectID('5981f167212b348aed7fa9f5'),  // Reference to users collection
        key_hash: await hashedApiKey('5981f167212b348ae32fa9f5'),  // We store a hash, never raw key
        label: 'Default Key',
        scope: ['read_cruises'],          // Optional: can match user scopes or add more granular scopes
        created: new Date(),
        last_used: null,
        disabled: false,
        expires: expiresAt
      }
    ];

    console.log('Searching for API Keys Collection');
    const result = await db.listCollections({ name: apiKeysTable }).toArray();

    if (result.length) {
      if (process.env.NODE_ENV !== 'development') {
        console.log('API Keys Collection already exists... we\'re done here.');
        return;
      }

      console.log('API Keys Collection exists... dropping it!');
      try {
        await db.dropCollection(apiKeysTable);
      }
      catch (err) {
        console.log('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating API Keys Collection');
    try {
      const collection = await db.createCollection(apiKeysTable);

      console.log('Creating API Key indexes');
      await collection.createIndex({ key_hash: 1 }, { unique: true });
      await collection.createIndex({ user_id: 1 });
      await collection.createIndex({ disabled: 1 });
      await collection.createIndex({ expires: 1 });  // for fast expiry checks

      console.log('Populating API Keys Collection');
      await collection.insertMany(init_data);
    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }
  }
};
