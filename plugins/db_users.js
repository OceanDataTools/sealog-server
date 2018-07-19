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
      username: "alvin",
      fullname: "Alvin",
      email: "alvin@alvin.whoi.edu",
      password: "$2a$10$smSa1wENOBcRGgnXrTsJxOm4UMsPFbaJHauDba13eJPWurO9OI/v6",
      last_login: new Date(),
      roles: ['admin', 'event_manager', 'event_logger', 'event_watcher'],
      system_user: true,
    },
    {
      _id: ObjectID("5981f167212b348aed7fb9f5"),
      username: "pilot",
      fullname: "Pilot",
      email: "pilot@alvin.whoi.com",
      password: "$2a$10$wIHRZ1Fo3ny/SoJM/UqQ2utOrBQQu9CXUz/oYkdlHw2fv15wM0t7m",
      last_login: new Date(),
      roles: ['event_manager', 'event_logger', 'event_watcher'],
      system_user: true,
    },
    {
      _id: ObjectID("5981f167212b348aed7fc9f5"),
      username: "stbd_obs",
      fullname: "Starboard Obs",
      email: "stbd_obs@alvin.whoi.com",
      password: "$2a$10$wIHRZ1Fo3ny/SoJM/UqQ2utOrBQQu9CXUz/oYkdlHw2fv15wM0t7m",
      last_login: new Date(),
      roles: ['event_manager', 'event_logger', 'event_watcher'],
      system_user: true,
    },
    {
      _id: ObjectID("5981f167212b348aed7fd9f5"),
      username: "port_obs",
      fullname: "Port Obs",
      email: "port_obs@alvin.whoi.com",
      password: "$2a$10$wIHRZ1Fo3ny/SoJM/UqQ2utOrBQQu9CXUz/oYkdlHw2fv15wM0t7m",
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
      collection.insertMany(init_data, function(err, result) {
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