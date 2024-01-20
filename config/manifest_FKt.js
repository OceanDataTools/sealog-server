// const Fs = require('fs');
const Pkg = require('../package.json');

// const tlsOptions = {
//   key: Fs.readFileSync(<privKey.pem>),
//   cert: Fs.readFileSync(<fullchain.pem>)
// };

const swagger_options = {
  info: {
    title: 'Sealog Server API Documentation',
    version: Pkg.version
  },
  tags: [
    {
      name: 'auth',
      description: 'the auth api'
    },
    {
      name: 'cruises',
      description: 'the cruises api'
    },
    {
      name: 'custom_vars',
      description: 'the custom_vars api'
    },
    {
      name: 'event_aux_data',
      description: 'the event_aux_data api'
    },
    {
      name: 'event_exports',
      description: 'the event_exports api'
    },
    {
      name: 'event_templates',
      description: 'the event_templates api'
    },
    {
      name: 'events',
      description: 'the events api'
    },
    {
      name: 'lowerings',
      description: 'the lowerings api'
    },
    {
      name: 'users',
      description: 'the users api'
    }
  ],
  grouping: 'tags',
  security: [{ API_KEY: [] }],
  securityDefinitions: {
    API_KEY: {
      type: 'apiKey',
      name: 'authorization',
      in: 'header'
    }
  }
};

const {
  sealogDB,
  sealogDB_devel
} = require('../config/db_constants');

let env = process.env.NODE_ENV || 'development';

env = (env === 'test') ? 'development' : env;
const envKey = (key) => {

  const configuration = {
    development: {
      host: '0.0.0.0',
      port: 8000,
      prefix: '/sealog-server',
      db: sealogDB_devel
    },
    debug: {
      host: '0.0.0.0',
      port: 8000,
      prefix: '/sealog-server',
      db: sealogDB
    },
    production: {
      host: '0.0.0.0',
      port: 8000,
      prefix: '/sealog-server',
      db: sealogDB
    }
  };

  return configuration[env][key];
};

const mongodb_URL = 'mongodb://localhost:27017/' + envKey('db');

const manifest = {
  server: {
    host: envKey('host') || '127.0.0.1',
    port: envKey('port') || '8000',
    // tls: tlsOptions,
    routes: {
      cors: true
    }
  },

  register: {
    plugins: [
      { plugin: 'hapi-auth-jwt2' },
      { plugin: 'hapi-mongodb', options:
        {
          url: mongodb_URL,
          settings: {
            maxPoolSize: 20,
            useNewUrlParser: true,
            useUnifiedTopology: true
          },
          decorate: true
        }
      },
      { plugin: './plugins/auth' },
      { plugin: './plugins/filesystem_init' },
      { plugin: './plugins/free_space' },
      { plugin: '@hapi/inert' },
      { plugin: '@hapi/vision' },
      { plugin: '@hapi/nes' },
      { plugin: './routes/api/v1/auth', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/cruises', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/custom_vars', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/default', options: {},
        routes: {
          prefix: envKey('prefix')
        }
      },
      { plugin: './routes/api/v1/event_aux_data', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/event_exports', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/event_templates', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/events', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/lowerings', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: './routes/api/v1/users', options: {},
        routes: {
          prefix: envKey('prefix') + '/api/v1'
        }
      },
      { plugin: 'hapi-pino',
        options: {
          logRequestComplete: process.env.NODE_ENV !== 'production',
          prettyPrint: process.env.NODE_ENV !== 'production',
          redact: ['req.headers.authorization']
        }
      },
      { plugin: 'hapi-swagger', options: swagger_options,
        routes: {
          prefix: envKey('prefix')
        }
      }
    ]
  }
};

if (process.env.NODE_ENV === 'development') { // DEVELOPMENT

  manifest.register.plugins.push({ 'plugin': 'blipp' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_cruises' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_custom_vars' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_event_aux_data' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_event_templates' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_events' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_lowerings' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_users' });
}
else if (process.env.NODE_ENV === 'test') { // TESTING

  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_cruises' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_custom_vars' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_event_aux_data' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_event_templates' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_events' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_lowerings' });
  manifest.register.plugins.push({ 'plugin': './plugins/dbDevel_users' });
}
else if (process.env.NODE_ENV === 'production') { // PRODUCTION

  manifest.register.plugins.push({ 'plugin': './plugins/db_cruises' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_custom_vars' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_event_aux_data' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_event_templates' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_events' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_lowerings' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_users' });
}
else if (env === 'debug') { // DEBUG

  manifest.register.plugins.push({ 'plugin': './plugins/db_cruises' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_custom_vars' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_event_aux_data' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_event_templates' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_events' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_lowerings' });
  manifest.register.plugins.push({ 'plugin': './plugins/db_users' });
}

module.exports = manifest;
