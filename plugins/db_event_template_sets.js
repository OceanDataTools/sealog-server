'use strict';
var test = require('assert');

const {
  eventTemplateSetsTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  // const ObjectID = server.mongo.ObjectID;

  // const init_data = [];

  console.log("Searching for Event Template Sets Collection");
  db.listCollections({name:eventTemplateSetsTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Event Template Sets Collection");
    db.createCollection(eventTemplateSetsTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      // console.log("Populating Event Template Sets Collection");
      // collection.insertMany(init_data, function(err, result) {
      //   test.equal(null, err);

      return next();

      // });
    });
  }).catch(function () {
    console.log("Collection already exists");
    return next();
  });
};

exports.register.attributes = {
  name: 'db_populate_event_template_sets',
  dependencies: ['hapi-mongodb']
};