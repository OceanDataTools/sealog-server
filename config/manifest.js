const envKey = key => {
  const env = process.env.NODE_ENV || 'development';

  const configuration = {
    development: {
//      host: process.env.HOST,
      host: 'localhost',
      port: 8000,
      chatPort: 8001
    },
    testing: {
      host: process.env.HOST,
//      host: 'localhost',
      port: 8000,
      chatPort: 8001
    },
    uat: {
      host: 'localhost',
      port: 8010,
      chatPort: 8011
    },
    // These should match environment variables on hosted server
    production: {
//      host: 'localhost',
      port: 8080,
      host: process.env.HOST,
//      port: process.env.PORT,
      chatPort: 8001
    }
  };

  return configuration[env][key];
};

const manifest = {
  connections: [
    {
      host: envKey('host'),
      port: envKey('port'),
      routes: {
        cors: true
      },
      router: {
        stripTrailingSlash: true
      },
      labels: ["api"]
    },
    {
      host: envKey('host'),
      port: envKey('chatPort'),
      routes: {
        cors: true
      },
      router: {
        stripTrailingSlash: true
      },
      labels: ["chat"]
    }
  ],
  registrations: [
    {
      plugin: 'hapi-auth-jwt2',
      options: {
        select: ['api', 'chat']
      }
    },
    {
      plugin: 'nes',
      options: {
        select: ['chat']
      }
    },
    {
      plugin: './plugins/db',
      options: {
        select: ['api', 'chat']
      }
    },
    {
      plugin: './plugins/auth',
      options: {
        select: ['api', 'chat']
      }
    },
    {
      plugin: './routes/auth',
      options: {
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/event_definitions'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/event_templates'
      },
      options: {
        routes: {
          prefix: '/api/v1',
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/events'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/event_exports'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/event_export_templates'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/event_aux_data'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/api/v1/users'
      },
      options: {
        routes: {
          prefix: '/api/v1'
        },
        select: ['api']
      }
    },
    {
      plugin: {
        register: './routes/default'
      },
      options: {
        select: ['api']
      }
    },
    {
      plugin: './routes/chat/chat',
      options: {
        select: ['chat']
      }
    },
    {
      plugin: 'inert',
      options: {
        select: ['api']
      }
    },
    {
      plugin: 'vision',
      options: {
        select: ['api']
      }
    },
    {
      plugin: 'hapi-swagger',
      options: {
        select: ['api'],
      }
    },
    {
      'plugin': {
        'register': 'good',
        'options': {
          'ops': { interval: 60000 },
          'reporters': {
            'console': [{
              'module': 'good-squeeze',
              'name': 'Squeeze',
              'args': [{
                'error': '*'
              }]
            }, {
              module: 'good-console'
            }, 'stdout']
          }
        }
      }
    }
  ]
};

module.exports = manifest;