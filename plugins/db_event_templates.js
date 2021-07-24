const {
  eventTemplatesTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_event_templates',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    // const ObjectID = server.mongo.ObjectID;

    console.log("Searching for Event Template Collection");
    try {
      const result = await db.listCollections({ name: eventTemplatesTable }).toArray();
      if (result.length > 0) {

        // Database migration logic
        const eventTemplates = await db.collection(eventTemplatesTable).find().toArray();

        eventTemplates.forEach(async (eventTemplate) => {
        
          // Add template_categories to eventTemplate if not present
          if ( eventTemplate.template_categories === undefined ) {
            console.log('Mirgation: Adding missing template_categories to event template');
            await db.collection(eventTemplatesTable).updateOne( { _id: eventTemplate._id }, { $set: { 'template_categories': [] } } );
          }

          // Add disabled to eventTemplate if not present
          if ( eventTemplate.disabled === undefined ) {
            console.log('Mirgation: Adding missing disabled to event template');
            await db.collection(eventTemplatesTable).updateOne( { _id: eventTemplate._id }, { $set: { 'disabled': false } } );
          }
        });

        console.log("Collection already exists... we're done here.");
        return;
      }
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }

    console.log("Creating Event Template Collection");
    try {
      await db.createCollection(eventTemplatesTable);
    }
    catch (err) {
      console.log("ERROR:", err.code);
      throw (err);
    }
  }
};