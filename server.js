const Glue = require('@hapi/glue');
const Manifest = require('./config/manifest');

const options = {
  relativeTo: __dirname
};

const startServer = async function () {

  try {
    const apiServer = await Glue.compose(Manifest, options);
    await apiServer.start();
    console.log('✅  Server is listening on ' + apiServer.info.uri.toLowerCase());
  }
  catch (err) {
    console.error(err);
    process.exit(1);
  }
};

startServer();