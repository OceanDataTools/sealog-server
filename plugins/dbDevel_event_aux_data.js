'use strict';
var test = require('assert');

const {
  eventAuxDataTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const test_data = [
    {
      _id : ObjectID("5a7341898c1553258f703ce0"),
      event_id: ObjectID('5981f167212b348aed7fa9f6'),
      data_source: "datagrabber",
      data_array: [{
        data_name: "latitude",
        data_value: "41.342981",
        data_uom: 'ddeg'

      },{
        data_name: "longitude",
        data_value: "-170.236345",
        data_uom: 'ddeg'
      },{
        data_name: "depth",
        data_value: "943.2",
        data_uom: 'meters'
      },{
        data_name: "heading",
        data_value: "75.2",
        data_uom: 'deg'
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce1"),
      event_id: ObjectID('5981f167212b348aed7fa9f6'),
      data_source: "framegrabber",
      data_array: [{
        data_name: "filename",
        data_value: "./path/framegrab_001.png"
      },{
        data_name: "camera_name",
        data_value: "Camera 01"
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce2"),
      event_id: ObjectID('5981f167212b348aed7fa9f6'),
      data_source: "customgrabber",
      data_array: [{
        data_name: "customField01",
        data_value: "100"
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce3"),
      event_id: ObjectID('5981f167212b348aed7fa9f7'),
      data_source: "framegrabber",
      data_array: [{
        data_name: "filename",
        data_value: "./path/framegrab_002.png"
      },{
        data_name: "camera_name",
        data_value: "Camera 02"
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce4"),
      event_id: ObjectID('5981f167212b348aed7fa9f7'),
      data_source: "datagrabber",
      data_array: [{
        data_name: "latitude",
        data_value: "41.342981",
        data_uom: 'ddeg'
      },{
        data_name: "longitude",
        data_value: "-170.236345",
        data_uom: 'ddeg'
      },{
        data_name: "depth",
        data_value: "943.2",
        data_uom: 'meters'
      },{
        data_name: "heading",
        data_value: "75.2",
        data_uom: 'deg'
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce5"),
      event_id: ObjectID('5981f167212b348aed7fa9f8'),
      data_source: "framegrabber",
      data_array: [{
        data_name: "filename",
        data_value: "./path/framegrab_003.png"
      },{
        data_name: "camera_name",
        data_value: "Camera 03"
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce6"),
      event_id: ObjectID('5981f167212b348aed7fa9f8'),
      data_source: "datagrabber",
      data_array: [{
        data_name: "latitude",
        data_value: "41.342981",
        data_uom: 'ddeg'
      },{
        data_name: "longitude",
        data_value: "-170.236345",
        data_uom: 'ddeg'
      },{
        data_name: "depth",
        data_value: "943.2",
        data_uom: 'meters'
      },{
        data_name: "heading",
        data_value: "75.2",
        data_uom: 'deg'
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce7"),
      event_id: ObjectID('5981f167212b348aed7fa9f9'),
      data_source: "framegrabber",
      data_array: [{
        data_name: "filename",
        data_value: "./path/framegrab_004.png"
      },{
        data_name: "camera_name",
        data_value: "Camera 04"
      }]
    },
    {
      _id : ObjectID("5a7341898c1553258f703ce8"),
      event_id: ObjectID('5981f167212b348aed7fa9f9'),
      data_source: "datagrabber",
      data_array: [{
        data_name: "latitude",
        data_value: "41.342981",
        data_uom: 'ddeg'
      },{
        data_name: "longitude",
        data_value: "-170.236345",
        data_uom: 'ddeg'
      },{
        data_name: "depth",
        data_value: "943.2",
        data_uom: 'meters'
      },{
        data_name: "heading",
        data_value: "75.2",
        data_uom: 'deg'
      }]
    }
  ];

  console.log("Searching for Event Aux Data Collection");
  db.listCollections({name:eventAuxDataTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Event Aux Data Collection");
    db.createCollection(eventAuxDataTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Event Aux Data Collection");
      collection.insertMany(test_data, function(err, result) {
        test.equal(null, err);

        return next();

      });
    });
  }).catch(function () {
    console.log("Event Aux Data Collection is present... dropping it");
    db.dropCollection(eventAuxDataTable).then(function(result) {

      console.log("Creating Event Aux Data Collection");
      db.createCollection(eventAuxDataTable, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        console.log("Populating Event Aux Data Collection");
        collection.insertMany(test_data, function(err, result) {
          test.equal(null, err);

          return next();
        });
      });

    }).catch(function () {
      console.log("unable to drop eventAuxDataTable");

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_event_aux_data',
  dependencies: ['hapi-mongodb']
};