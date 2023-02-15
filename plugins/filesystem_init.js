const Fs = require('fs');
const  Mkdirp = require('mkdirp');

const {
  IMAGE_PATH,
  CRUISE_PATH,
  LOWERING_PATH
} = require('../config/path_constants');

const createDir = (path) => {

  return Mkdirp(path).then(() => {

    console.log('Directory Created ' + path);
  }).catch((err) => {

    console.error(err);
  });
};


exports.plugin = {
  name: 'filesystem_init',
  dependencies: [],
  register: async (options) => {

    console.log('Searching for Image Directory');
    if (!Fs.existsSync(IMAGE_PATH)) {
      console.log('Image Directory not found... trying to create.');
      await createDir(IMAGE_PATH);
    }
    else {
      console.log('Image Directory found.');
    }

    console.log('Searching for Cruise Directory');
    if (!Fs.existsSync(CRUISE_PATH)) {
      console.log('Cruise Directory not found... trying to create.');
      await createDir(CRUISE_PATH);
    }
    else {
      console.log('Cruise Directory found.');
    }

    console.log('Searching for Lowering Directory');
    if (!Fs.existsSync(LOWERING_PATH)) {
      console.log('Lowering Directory not found... trying to create.');
      await createDir(LOWERING_PATH);
    }
    else {
      console.log('Lowering Directory found.');
    }
  }
};
