const Fs = require('fs');
const Mkdirp = require('mkdirp');

const {
  IMAGE_PATH,
  CRUISE_PATH,
  LOWERING_PATH
} = require('../config/path_constants');

exports.plugin = {
  name: 'filesystem_init',
  dependencies: [],
  register: async (options) => {

    console.log("Searching for Image Directory");
    if (!Fs.existsSync(IMAGE_PATH)){
      console.log("Image Directory not found... trying to create.");
      await Mkdirp(IMAGE_PATH, (err) => {

        if (err) {
          console.error(err);
        }
        else {
          console.log('Image Directory created');
        }
      });
    }
    else {
      console.log("Image Directory found.");
    }

    console.log("Searching for Cruise Directory");
    if (!Fs.existsSync(CRUISE_PATH)){
      console.log("Cruise Directory not found... trying to create.");
      await Mkdirp(CRUISE_PATH, (err) => {

        if (err) {
          console.error(err);
        }
        else {
          console.log('Cruise Directory created');
        }
      });
    }
    else {
      console.log("Cruise Directory found.");
    }

    console.log("Searching for Lowering Directory");
    if (!Fs.existsSync(LOWERING_PATH)){
      console.log("Lowering Directory not found... trying to create.");
      await Mkdirp(LOWERING_PATH, (err) => {

        if (err) {
          console.error(err);
        }
        else {
          console.log('Lowering Directory created');
        }
      });
    }
    else {
      console.log("Lowering Directory found.");
    }
  }
};
