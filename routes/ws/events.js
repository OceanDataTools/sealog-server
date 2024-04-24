exports.plugin = {
  name: 'routes-ws-events',
  dependencies: ['@hapi/nes'],
  register: (server, options) => {

    server.method('publishNewEvent', ( payload ) => {

      server.publish('/ws/status/newEvents', payload );
    });

    server.subscription('/ws/status/newEvents', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishUpdateEvent', ( payload ) => {

      server.publish('/ws/status/updateEvents', payload );
    });

    server.subscription('/ws/status/updateEvents', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishDeleteEvent', ( payload ) => {

      server.publish('/ws/status/deleteEvents', payload );
    });

    server.subscription('/ws/status/deleteEvents', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishUpdateCustomVar', ( payload ) => {

      server.publish('/ws/status/updateCustomVars', payload );
    });

    server.subscription('/ws/status/updateCustomVars', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishNewCruise', ( payload ) => {

      server.publish('/ws/status/newCruises', payload );
    });

    server.subscription('/ws/status/newCruises', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishUpdateCruise', ( payload ) => {

      server.publish('/ws/status/updateCruises', payload );
    });

    server.subscription('/ws/status/updateCruises', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishNewLowering', ( payload ) => {

      server.publish('/ws/status/newLowerings', payload );
    });

    server.subscription('/ws/status/newLowerings', { 
      auth: {
        type: 'direct'
      },
    });


    server.method('publishUpdateLowering', ( payload ) => {

      server.publish('/ws/status/updateLowerings', payload );
    });

    server.subscription('/ws/status/updateLowerings', { 
      auth: {
        type: 'direct'
      },
    });

  }
};
