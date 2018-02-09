'use strict';
var test = require('assert');

const {
  eventExportTemplatesTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const db = server.mongo.db;
  // const ObjectID = server.mongo.ObjectID;

  const test_data = [
    {
      event_export_template_name: "All Events",
      event_export_template_eventvalue_filter: [],
      event_export_template_offset: 0,
      event_export_template_limit: 0,
      event_export_template_startTS: '',
      event_export_template_stopTS: new Date('2018-12-31T23:59:59.999Z'),
      event_export_template_author_filter: [],
      event_export_template_datasource_filter: [],
      event_export_template_freetext_filter: '',
      event_export_template_include_aux_data: true
    },
    {
      event_export_template_name: "All Sample Events",
      event_export_template_eventvalue_filter: ["SAMPLE"],
      event_export_template_offset: 0,
      event_export_template_limit: 0,
      event_export_template_startTS: '',
      event_export_template_stopTS: new Date('2018-12-31T23:59:59.999Z'),
      event_export_template_author_filter: [],
      event_export_template_datasource_filter: [],
      event_export_template_freetext_filter: '',
      event_export_template_include_aux_data: true
    },
    {
      event_export_template_name: "All Events w/ Framegrabs",
      event_export_template_eventvalue_filter: [],
      event_export_template_offset: 0,
      event_export_template_limit: 0,
      event_export_template_startTS: '',
      event_export_template_stopTS: new Date('2018-12-31T23:59:59.999Z'),
      event_export_template_author_filter: [],
      event_export_template_datasource_filter: ['framegrabber'],
      event_export_template_freetext_filter: '',
      event_export_template_include_aux_data: true
    }

  ];

  console.log("Searching for Event Export Templates Collection");
  db.listCollections({name:eventExportTemplatesTable}).toArray().then(function(names) {
    test.equal(0, names.length);

    console.log("Creating Event Export Templates Collection");
    db.createCollection(eventExportTemplatesTable, function(err, collection) {
      test.equal(null, err);

      // Insert a document in the capped collection
      console.log("Populating Event Export Templates Collection");
      collection.insertMany(test_data, function(err, result) {
        test.equal(null, err);

        return next();

      });
    });
  }).catch(function () {
    console.log("Event Export Templates Collection is present... dropping it");
    db.dropCollection(eventExportTemplatesTable).then(function(result) {

      console.log("Creating Event Export Templates Collection");
      db.createCollection(eventExportTemplatesTable, function(err, collection) {
        test.equal(null, err);

        // Insert a document in the capped collection
        console.log("Populating Event Export Templates Collection");
        collection.insertMany(test_data, function(err, result) {
          test.equal(null, err);

          return next();
        });
      });
    }).catch(function () {
      console.log("unable to drop eventExportTemplatesTable");

      return next();

    });
  });
};

exports.register.attributes = {
  name: 'db_populate_event_export_templates',
  dependencies: ['hapi-mongodb']
};