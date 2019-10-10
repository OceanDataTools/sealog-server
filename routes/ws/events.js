exports.plugin = {
  name: 'routes-ws-events',
  dependencies: ['@hapi/nes'],
  register: (server, options) => {

    server.method('publishNewEvent', ( payload ) => {

      server.publish('/ws/status/newEvents', payload );
    });

    server.subscription('/ws/status/newEvents');

    
    server.method('publishUpdateEvent', ( payload ) => {

      server.publish('/ws/status/updateEvents', payload );
    });

    server.subscription('/ws/status/updateEvents');


    server.method('publishDeleteEvent', ( payload ) => {
      
      server.publish('/ws/status/deleteEvents', payload );
    });

    server.subscription('/ws/status/deleteEvents');

    server.method('publishUpdateCustomVar', ( payload ) => {
      
      server.publish('/ws/status/updateCustomVars', payload );
    });

    server.subscription('/ws/status/updateCustomVars');

  }
};