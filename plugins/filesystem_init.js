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

    console.log('Searching for Image Directory');
    if (!Fs.existsSync(imagePath)) {
      console.log('Image Directory not found... trying to create.');
      await mkdirp(imagePath).then(() =>

        console.log('Image Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }
    else {
      console.log('Image Directory found.');
    }

    console.log('Searching for Cruise Directory');
    if (!Fs.existsSync(cruisePath)) {
      console.log('Cruise Directory not found... trying to create.');
      await mkdirp(cruisePath).then(() =>

        console.log('Cruise Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }
    else {
      console.log('Cruise Directory found.');
    }

    console.log('Searching for Lowering Directory');
    if (!Fs.existsSync(loweringPath)) {
      console.log('Lowering Directory not found... trying to create.');
      await mkdirp(loweringPath).then(() =>

        console.log('Lowering Directory created')
      ).catch((err) =>

        console.error(err)
      );
    }
    else {
      console.log('Lowering Directory found.');
    }
  }
};
