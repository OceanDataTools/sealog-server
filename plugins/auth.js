const SECRET_KEY = require('../config/secret');

const {
  usersTable,
} = require('../config/db_constants');

exports.register = function (server, options, next) {

  const validateFunction = (decoded, request, callback) => {

    const db = request.mongo.db;
    const ObjectID = request.mongo.ObjectID;

    // console.log("decoded:", decoded);

    db.collection(usersTable).findOne({ _id: new ObjectID(decoded.id) }, (err, results) => {

      // console.log("results:", results);

      if (err) {
        console.log("ERROR:", err);
        return callback(null, false);
      }

      if (!results) {
        return callback(null, false);

      } else if ( results.roles.toString() !== decoded.scope.toString() ) {
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
  dependencies: ['hapi-mongodb', 'hapi-auth-jwt2']
};