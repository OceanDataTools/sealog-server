const checkDiskSpace = require('check-disk-space').default;
const Boom = require('@hapi/boom');
const { imagePath } = require('../config/server_settings');

const {
  customVarsTable
} = require('../config/db_constants');

exports.plugin = {
  name: 'free_space',
  dependencies: [],
  register: (server, options) => {

    const db = server.mongo.db;

    const check_disk_space = async () => {

      await checkDiskSpace(imagePath).then(async (diskSpace) => {

        try {
          let query = { custom_var_name: 'freeSpaceInBytes' };
          let results = await db.collection(customVarsTable).findOneAndUpdate(query, { $set: { custom_var_value: diskSpace.free.toString() } }, { returnNewDocument: true });
          server.publish('/ws/status/updateCustomVars', { id: results.value._id, custom_var_name: results.value.custom_var_name, custom_var_value: results.value.custom_var_value } );

          query = { custom_var_name: 'freeSpacePercentage' };
          results = await db.collection(customVarsTable).findOneAndUpdate(query, { $set: { custom_var_value: Math.round((diskSpace.free / diskSpace.size) * 100).toString() } }, { returnNewDocument: true });
          server.publish('/ws/status/updateCustomVars', { id: results.value._id, custom_var_name: results.value.custom_var_name, custom_var_value: results.value.custom_var_value } );
        }
        catch (err) {
          return Boom.serverUnavailable('check-disk-space error: ', err);
        }
      });
    };

    setInterval(check_disk_space, 60000); // once per minute
  }
};
