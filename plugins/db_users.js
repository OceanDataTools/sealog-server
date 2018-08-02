'use strict';
var test = require('assert');

const {
  usersTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  const ObjectID = server.mongo.ObjectID;

  const init_data = [
    {
      _id: ObjectID("5981f167212b348aed7fa9f5"),
      username: "admin",
      fullname: "Admin",
      email: "admin@notarealserver.com",
      password: "$2a$10$XXtpkkegXzqsCj1pN.Y5sus81F9/pvaLxmMjUc401.DZL3oZbh11i",
      last_login: new Date(),
      roles: ['admin', 'event_manager', 'event_logger', 'event_watcher'],
      system_user: true,
    },
    {
      _id: ObjectID("5981f167212b348aed7fb9f5"),
      username: "guest",
      fullname: "Guest",
      email: "guest@notarealserver.com",
      password: "$2a$10$oTRayeYC2sOAuW9vapp3Ze6zVFsGyj40cc1XgWv.NL/hGLNi82Whq",
      last_login: new Date(),
      roles: ['event_manager', 'event_logger', 'event_watcher'],
      system_user: true,
    }
  ];

  console.log("Searching for Users Collection");
  db.listCollections({name:usersTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Users Collection");
    db.createCollection(usersTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Users Collection");
      collection.insertMany(init_data, function(err) {
        test.equal(null, err);

        return next();

      });
    });
  }).catch(function () {
    console.log("Collection already exists");
    return next();
  });
};

exports.register.attributes = {
  name: 'db_populate_users',
  dependencies: ['hapi-mongodb']
};