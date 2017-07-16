'use strict';
const r = require('rethinkdbdash')();
const {
  eventloggerDB,
  eventloggerDB_devel,
  usersTable,
  eventsTable,
  auxDataTable,
  eventDefinitionTable,
  eventTemplateTable,
  eventExportTemplateTable
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  if(process.env.NODE_ENV == 'development') {
    server.app.db = r.db(eventloggerDB_devel);
  } else if(process.env.NODE_ENV == 'testing') {
    server.app.db = r.db(eventloggerDB_devel);
  } else {
    server.app.db = r.db(eventloggerDB);
  }
  server.app.r = r;

  return next();

};


//if(err) {
//        if(!err.name === 'ReqlOpFailedError') {
//          return next(err);
//        }
//      }

exports.register.attributes = {
  name: 'db'
};
