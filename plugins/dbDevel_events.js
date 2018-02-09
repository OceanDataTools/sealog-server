'use strict';
var test = require('assert');

const {
  eventsTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const test_data = [
    {
      _id: ObjectID('5981f167212b348aed7fa9f5'),
      event_author: 'admin',
      ts: new Date(),
      event_value: "FISH",
      event_options: [{
        event_option_name: "status",
        event_option_value: "alive"
      }],
      event_free_text: "some free text",
    }, {
      _id: ObjectID('5981f167212b348aed7fa9f6'),
      event_author: 'user',
      ts: new Date(),
      event_value: "CORAL",
      event_options: [{
        event_option_name: "status",
        event_option_value: "alive"
      }],
      event_free_text: "some more text",
    }, {
      _id: ObjectID('5981f167212b348aed7fa9f7'),
      event_author: 'user',
      ts: new Date(),
      event_value: "FISH",
      event_options: [{
        event_option_name: "status",
        event_option_value: "alive"
      }],
      event_free_text: "some other text",
    }, {
      _id: ObjectID('5981f167212b348aed7fa9f8'),
      event_author: 'admin',
      ts: new Date(),
      event_value: "FISH",
      event_options: [{
        event_option_name: "status",
        event_option_value: "alive"
      }],
      event_free_text: "some misc text",
    }, {
      _id: ObjectID('5981f167212b348aed7fa9f9'),
      event_author: 'admin',
      ts: new Date(),
      event_value: "FISH",
      event_options: [{
        event_option_name: "status",
        event_option_value: "dead"
      }],
      event_free_text: "some free text",
    }
  ];

  console.log("Searching for Events Collection");
  db.listCollections({name:eventsTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Events Collection");
    db.createCollection(eventsTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Events Collection");
      collection.insertMany(test_data, function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({event_free_text:"text"}).then(() => {
          return next();
        });
      });
    });
  }).catch(function () {
    console.log("Events Collection is present... dropping it");
    db.dropCollection(eventsTable).then(function(result) {

      console.log("Creating Events Collection");
      db.createCollection(eventsTable, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        console.log("Populating Events Collection");
        collection.insertMany(test_data, function(err, result) {
          test.equal(null, err);

          collection.ensureIndex({event_free_text:"text"}).then(() => {
            return next();
          });
        });
      });
    }).catch(function () {
      console.log("unable to drop", eventsTable);

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_events',
  dependencies: ['hapi-mongodb']
};