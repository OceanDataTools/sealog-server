const {
  eventAuxDataTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'db_populate_event_aux_data',
  dependencies: ['hapi-mongodb'],
  register: async (server, options) => {

    const db = server.mongo.db;
    const ObjectID = server.mongo.ObjectID;

    const init_data = [
      {
        _id: ObjectID('5a7341898c1553258f703ce0'),
        event_id: ObjectID('5981f167212b348aed7fa9f6'),
        data_source: 'vehicleRealtimeNavData',
        data_array: [{
          data_name: 'latitude',
          data_value: '41.342981',
          data_uom: 'ddeg'

        },{
          data_name: 'longitude',
          data_value: '-170.236345',
          data_uom: 'ddeg'
        },{
          data_name: 'depth',
          data_value: '943.2',
          data_uom: 'meters'
        },{
          data_name: 'heading',
          data_value: '75.2',
          data_uom: 'deg'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce1'),
        event_id: ObjectID('5981f167212b348aed7fa9f6'),
        data_source: 'framegrabber',
        data_array: [{
          data_name: 'camera_name',
          data_value: 'Camera 01'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_001.png'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce2'),
        event_id: ObjectID('5981f167212b348aed7fa9f6'),
        data_source: 'customgrabber',
        data_array: [{
          data_name: 'customField01',
          data_value: '100'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce3'),
        event_id: ObjectID('5981f167212b348aed7fa9f7'),
        data_source: 'framegrabber',
        data_array: [{
          data_name: 'camera_name',
          data_value: 'Camera 02'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_002.png'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce4'),
        event_id: ObjectID('5981f167212b348aed7fa9f7'),
        data_source: 'vehicleRealtimeNavData',
        data_array: [{
          data_name: 'latitude',
          data_value: '41.342981',
          data_uom: 'ddeg'
        },{
          data_name: 'longitude',
          data_value: '-170.236345',
          data_uom: 'ddeg'
        },{
          data_name: 'depth',
          data_value: '943.2',
          data_uom: 'meters'
        },{
          data_name: 'heading',
          data_value: '75.2',
          data_uom: 'deg'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce5'),
        event_id: ObjectID('5981f167212b348aed7fa9f8'),
        data_source: 'framegrabber',
        data_array: [{
          data_name: 'camera_name',
          data_value: 'Camera 03'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_003.png'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce6'),
        event_id: ObjectID('5981f167212b348aed7fa9f8'),
        data_source: 'vehicleRealtimeNavData',
        data_array: [{
          data_name: 'latitude',
          data_value: '41.342981',
          data_uom: 'ddeg'
        },{
          data_name: 'longitude',
          data_value: '-170.236345',
          data_uom: 'ddeg'
        },{
          data_name: 'depth',
          data_value: '943.2',
          data_uom: 'meters'
        },{
          data_name: 'heading',
          data_value: '75.2',
          data_uom: 'deg'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce7'),
        event_id: ObjectID('5981f167212b348aed7fa9f9'),
        data_source: 'framegrabber',
        data_array: [{
          data_name: 'camera_name',
          data_value: 'Camera 01'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_001.png'
        },{
          data_name: 'camera_name',
          data_value: 'Camera 02'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_002.png'
        },{
          data_name: 'camera_name',
          data_value: 'Camera 03'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_003.png'
        },{
          data_name: 'camera_name',
          data_value: 'Camera 04'
        },{
          data_name: 'filename',
          data_value: './path/framegrab_004.png'
        }]
      },
      {
        _id: ObjectID('5a7341898c1553258f703ce8'),
        event_id: ObjectID('5981f167212b348aed7fa9f9'),
        data_source: 'vehicleRealtimeNavData',
        data_array: [{
          data_name: 'latitude',
          data_value: '41.342981',
          data_uom: 'ddeg'
        },{
          data_name: 'longitude',
          data_value: '-170.236345',
          data_uom: 'ddeg'
        },{
          data_name: 'depth',
          data_value: '943.2',
          data_uom: 'meters'
        },{
          data_name: 'heading',
          data_value: '75.2',
          data_uom: 'deg'
        }]
      }
    ];

    console.log('Searching for Event Aux Data Collection');
    const result = await db.listCollections({ name: eventAuxDataTable }).toArray();

    if (result.length) {
      if (process.env.NODE_ENV !== 'development') {
        console.log('Event Aux Data Collection already exists... we\'re done here.');
        return;
      }

      console.log('Event Aux Data Collection exists... dropping it!');
      try {
        await db.dropCollection(eventAuxDataTable);
      }
      catch (err) {
        console.log('DROP ERROR:', err.code);
        throw (err);
      }
    }

    console.log('Creating Event Aux Data Collection');
    try {
      const collection = await db.createCollection(eventAuxDataTable);

      console.log('Creating index based on event_id field');
      await collection.createIndex({ event_id: 1 });

      if (process.env.NODE_ENV === 'development') {
        console.log('Populating Event Aux Data Collection');
        await collection.insertMany(init_data);
      }
    }
    catch (err) {
      console.log('CREATE ERROR:', err.code);
      throw (err);
    }
  }
};
