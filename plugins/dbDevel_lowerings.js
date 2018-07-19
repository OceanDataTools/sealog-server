'use strict';
var test = require('assert');

const {
  loweringsTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const test_data = [];

  console.log("Searching for Lowerings Collection");
  db.listCollections({name:loweringsTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Lowerings Collection");
    db.createCollection(loweringsTable, function(err, collection) {
      test.equal(null, err);

      return next();

      // // Insert a document in the capped collection
      // console.log("Populating Lowerings Collection");
      // collection.insertMany(test_data, function(err, result) {
      //   test.equal(null, err);

      //   collection.ensureIndex({lowering_free_text:"text"}).then(() => {
      //     return next();
      //   });
      // });

    });
  }).catch(function () {
    console.log("Lowerings Collection is present... dropping it");
    db.dropCollection(loweringsTable).then(function(result) {

      console.log("Creating Lowerings Collection");
      db.createCollection(loweringsTable, function(err, collection) {
        test.equal(null, err);

        return next();

        // // Insert a document in the capped collection
        // console.log("Populating Lowerings Collection");
        // collection.insertMany(test_data, function(err, result) {
        //   test.equal(null, err);

        //   collection.ensureIndex({lowering_free_text:"text"}).then(() => {
        //     return next();
        //   });
        // });

      });
    }).catch(function () {
      console.log("unable to drop", loweringsTable);

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_lowerings',
  dependencies: ['hapi-mongodb']
};