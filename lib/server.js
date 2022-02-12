const Glue = require('@hapi/glue');
const Manifest = require('../config/manifest');

const options = {
  relativeTo: __dirname + '/..'
};

let apiTestServer = null;

exports.init = async () => {

  apiTestServer = await Glue.compose(Manifest, options);
  return apiTestServer;
};

exports.start = async () => {

  try {
    await apiTestServer.start();
    console.log('✅  Test Server is listening on ' + apiTestServer.info.uri.toLowerCase());
  }
  catch (err) {
    console.error(err);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {

  console.log(err);
  process.exit(1);
});
