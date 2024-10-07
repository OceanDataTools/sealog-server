const { spawn } = require('child_process');
const Boom = require('@hapi/boom');

const {
  useAccessControl
} = require('../../../config/server_settings');

const {
  authorizationHeader,
  cruiseParam,
  loweringParam
} = require('../../../lib/validations');

const {
  loweringsTable,
  cruisesTable
} = require('../../../config/db_constants');

exports.plugin = {
  name: 'routes-api-external-calls',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    const clients = options.clients;

    const execute_cmd = (request, h, command) => {

      if (!command) {
        return h.response({ message: 'No command specified.' }).code(409);
      }

      if (options.child) {
        return h.response({ message: 'A command is already running.' }).code(409);
      }

      // Start the new child process
      clients.forEach((client) => {

        if(!client.isOpen()) {
          clients.delete(client)
          return
        }

        try {
          client.send(`Executing ${command}`);
        }
        catch (err) {
          return Boom.badRequest('client not connected');
        }
      }); // Send to all clients

      const args = command.split(' ');
      options.child = spawn(args[0], args.slice(1));

      // Stream stdout data back to all connected WebSocket clients
      options.child.stdout.on('data', (data) => {

        clients.forEach((client) => {

          if(!client.isOpen()) {
            clients.delete(client)
            return
          }

          try {
            client.send(data.toString().replace(/\n+$/, ''));
          }
          catch (err) {
            return Boom.badRequest('client not connected');
          }
        }); // Send to all clients
      });

      // Stream stderr data back to all connected WebSocket clients
      options.child.stderr.on('data', (data) => {

        clients.forEach((client) => {

          if(!client.isOpen()) {
            clients.delete(client)
            return
          }

          try {
            client.send(data.toString().replace(/\n+$/, ''));
          }
          catch (err) {
            return Boom.badRequest('client not connected');
          }
        }); // Send to all clients
      });

      // Handle child process exit
      options.child.on('close', (code) => {

        const exitMessage = `Process exited with code: ${code}`;
        clients.forEach((client) => {

          if(!client.isOpen()) {
            clients.delete(client)
            return
          }

          client.send(exitMessage);
          try {
            client.disconnect();
            clients.delete(client);
          }
          catch (err) {}
        }); // Send exit message to all clients

        options.child = null; // Reset child process
      });

      return h.response({ message: 'Command is being executed.' }).code(202);
    };


    server.route({
      method: 'GET',
      path: '/external_calls/execute_export_lowering/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        try {
          const lowering = await db.collection(loweringsTable).findOne({ _id: ObjectID(request.params.id) });

          if (!lowering) {
            return Boom.badRequest('No record lowering found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && lowering.lowering_hidden && (useAccessControl && typeof lowering.lowering_access_list !== 'undefined' && !lowering.lowering_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to execute this route');
          }

          const command = './venv/bin/python ./misc/sealog_data_export.py -v -L ' + lowering.lowering_id;
          return execute_cmd(request, h, command);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: loweringParam
        },
        response: {
          status: {}
        },
        description: 'Execute post lowering data export for a specific lowering',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['external_calls','api']
      }
    });


    server.route({
      method: 'GET',
      path: '/external_calls/execute_export_cruise/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const ObjectID = request.mongo.ObjectID;

        try {
          const cruise = await db.collection(cruisesTable).findOne({ _id: ObjectID(request.params.id) });

          if (!cruise) {
            return Boom.badRequest('No record cruise found for id: ' + request.params.id );
          }

          if (!request.auth.credentials.scope.includes('admin') && cruise.cruise_hidden && (useAccessControl && typeof cruise.cruise_access_list !== 'undefined' && !cruise.cruise_access_list.includes(request.auth.credentials.id))) {
            return Boom.unauthorized('User not authorized to execute this route');
          }

          const command = './venv/bin/python ./misc/sealog_data_export.py -v -C ' + cruise.cruise_id;
          return execute_cmd(request, h, command);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }

      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: cruiseParam
        },
        response: {
          status: {}
        },
        description: 'Execute post cruise data export for a specific cruise',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['external_calls','api']
      }
    });
  }
};
