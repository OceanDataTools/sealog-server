'use strict';
var test = require('assert');

const {
  eventTemplateSetsTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const test_data = [
    {
      "_id" : ObjectID("5a73235e88acc0234103fa33"),
      event_template_set_name: "Awesome Events",
      event_templates: []
    },
    {
      "_id" : ObjectID("5a73235e88acc0234103fa34"),
      event_template_set_name: "Awesomer Events",
      event_templates: []
    }
  ];

  console.log("Searching for Event Template Sets Collection");
  db.listCollections({name:eventTemplateSetsTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Event Template Sets Collection");
    db.createCollection(eventTemplateSetsTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Event Template Sets Collection");
      collection.insertMany(test_data, function(err, result) {
        test.equal(null, err);

        return next();

      });
    });
  }).catch(function () {
    console.log("Event Template Sets Collection is present... dropping it");
    db.dropCollection(eventTemplateSetsTable).then(function(result) {

      console.log("Creating Event Template Sets Collection");
      db.createCollection(eventTemplateSetsTable, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        console.log("Populating Event Template Sets Collection");
        collection.insertMany(test_data, function(err, result) {
          test.equal(null, err);

          return next();
        });
      });
    }).catch(function () {
      console.log("unable to drop eventTemplateSetsTable");

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_event_template_sets',
  dependencies: ['hapi-mongodb']
};