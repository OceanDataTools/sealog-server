'use strict';
var test = require('assert');

const {
  customVarsTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const test_data = [
    {
      _id: ObjectID('59810167212b348aed7fa9f5'),
      custom_var_name: 'asnapStatus',
      custom_var_value: 'Off',
    }
  ];

  console.log("Searching for Custom Vars Collection");
  db.listCollections({name:customVarsTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Custom Vars Collection");
    db.createCollection(customVarsTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Custom Vars Collection");
      collection.insertMany(test_data, function(err, result) {
        test.equal(null, err);
        return next();
      });
    });
  }).catch(function () {
    console.log("Custom Vars Collection is present... dropping it");
    db.dropCollection(customVarsTable).then(function(result) {

      console.log("Creating Custom Vars Collection");
      db.createCollection(customVarsTable, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        console.log("Populating Custom Vars Collection");
        collection.insertMany(test_data, function(err, result) {
          test.equal(null, err);
          return next();
        });
      });
    }).catch(function () {
      console.log("unable to drop", customVarsTable);

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_custom_vars',
  dependencies: ['hapi-mongodb']
};