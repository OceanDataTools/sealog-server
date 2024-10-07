
exports.plugin = {
  name: 'routes-ws-external_calls',
  dependencies: ['@hapi/nes'],
  register: (server, options) => {

    const clients = options.clients;

    server.route({
      method: 'GET',
      path: '/execute_output',
      config: {
        id: 'execute_output',
        // websocket: true,
        handler: (request) => {

          clients.add(request.socket); // Store the WebSocket connection

          return 'connection request received';
        },
        description: 'Execute external call',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['external_calls','api']
      }
    });
  }
};
