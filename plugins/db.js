'use strict';
const r = require('rethinkdbdash')();
//const Bcrypt = require('bcrypt');

exports.register = function (server, options, next) {

//  const db = mongojs('eventlogger', ['events', 'event_definitions', 'event_templates', 'users']);
  const eventloggerDB = 'eventlogger';
  const eventloggerDB_devel = 'eventlogger_devel';
  // const usersTable = 'users';
  // const eventsTable = 'events';
  // const auxDataTable = 'event_aux_data';
  // const eventDefinitionTable = 'event_definitions';
  // const eventTemplateTable = 'event_templates';
  // const eventExportTemplateTable = 'event_export_templates';

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
