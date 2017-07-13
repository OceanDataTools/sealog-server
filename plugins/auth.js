const SECRET_KEY = require('../config/secret');

exports.register = function (server, options, next) {

  const db = server.app.db;

  const validateFunction = (decoded, request, callback) => {
    // NOTE: This is purely for demonstration purposes!

    db.table('users').get(decoded.id).run().then((user) => {

      //console.log(decoded);

      if (!user) {
        return callback(null, false);
      } else if ( user.roles.toString() !== decoded.scope.toString() ) {
        return callback(null, false);
      }
      return callback(null, true);
    });
  };

  server.auth.strategy('jwt', 'jwt', {
    key: SECRET_KEY,
    verifyOptions: {
      algorithms: ['HS256']
    },
    // Implement validation function
    validateFunc: validateFunction
  });

  // Uncomment this to apply default auth to all routes
  //plugin.auth.default('jwt');

  return next();
};

exports.register.attributes = {
  name: 'auth',
  dependencies: ['db', 'hapi-auth-jwt2']
};