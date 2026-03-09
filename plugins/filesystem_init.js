const Fs = require('fs');
const { mkdirp } = require('mkdirp');

const {
  imagePath,
  cruisePath,
  loweringPath
} = require('../config/server_settings');

exports.plugin = {
  name: 'filesystem_init',
  dependencies: [],
  register: async (options) => {

    if (!Fs.existsSync(imagePath)) {
      console.debug('Image Directory not found... trying to create.');
      await mkdirp(imagePath).then(() =>

        console.debug('Image Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }

    if (!Fs.existsSync(cruisePath)) {
      console.debug('Cruise Directory not found... trying to create.');
      await mkdirp(cruisePath).then(() =>

        console.debug('Cruise Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }

    if (!Fs.existsSync(loweringPath)) {
      console.debug('Lowering Directory not found... trying to create.');
      await mkdirp(loweringPath).then(() =>

        console.debug('Lowering Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }
  }
};
