const hashSync = require('bcryptjs').hashSync;
const randomBytes = require('crypto').randomBytes;
const Deepcopy = require('deepcopy');
const Fs = require('fs');
const { ObjectId } = require('mongodb');

const saltRounds = 10;

const {
  loweringsTable,
  cruisesTable
} = require('../config/db_constants');

const addEventRecordIDs = async (request, records) => {

  const db = request.mongo.db;

  const new_results = await records.map(async (doc) => {

    const cruise_lowering_query = {};

    // time bounds based on event start/stop times
    cruise_lowering_query.$and = [{ start_ts: { $lte: doc.ts } }, { stop_ts: { $gte: doc.ts } }];

    try {
      const event_cruise = await db.collection(cruisesTable).findOne(cruise_lowering_query);

      if (event_cruise) {
        doc.cruise_id = event_cruise.cruise_id;
      }
    }
    catch (err) {
      console.error('ERROR:', err);
    }

    try {
      const event_lowering = await db.collection(loweringsTable).findOne(cruise_lowering_query);

      if (event_lowering) {
        doc.lowering_id = event_lowering.lowering_id;
      }
    }
    catch (err) {
      console.error('ERROR:', err);
    }

    return doc;
  });

  await Promise.all(new_results);

  return records;

};

const arrayMove = (arr, old_index, new_index) => {

  if (new_index >= arr.length) {
    let k = new_index - arr.length + 1;
    while (k--) {
      arr.push(undefined);
    }
  }

  arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
  return arr;
};

const buildEventCSVHeaders = (flat_events) => {

  let csv_headers = flat_events.reduce((headers, event) => {

    const key_names = Object.keys(event);

    return headers.concat(key_names).filter((value, index, self) => {

      return self.indexOf(value) === index;
    });
  }, ['id','ts','event_value','event_author','event_free_text']);

  csv_headers = csv_headers.slice(0, 5).concat(csv_headers.slice(5).filter((header) => header.startsWith('event_option')).sort(), csv_headers.slice(5).filter((header) => !header.startsWith('event_option')).sort());

  const cruise_index = csv_headers.findIndex((header) => header === 'cruise_id');
  if (cruise_index > -1) {
    csv_headers = arrayMove(csv_headers, cruise_index, 1);
  }

  const lowering_index = csv_headers.findIndex((header) => header === 'lowering_id');
  if (lowering_index > -1) {
    csv_headers = arrayMove(csv_headers, lowering_index, 2);
  }

  return csv_headers;

};

const buildEventsQuery = (request, start_ts = new Date('1970-01-01T00:00:00.000Z'), stop_ts = new Date() ) => {

  const query = {};
  if (request.query.author) {
    if (typeof request.query.author === 'string') {
      request.query.author = [request.query.author];
    }

    const regex_query = request.query.author.map((author) => {

      const return_regex = new RegExp(author, 'i');
      return return_regex;
    });

    query.event_author  = { $in: regex_query };
  }

  if (request.query.value) {
    if (typeof request.query.value === 'string') {
      request.query.value = [request.query.value];
    }

    const inList = [];
    const ninList = [];

    for ( const value of request.query.value ) {
      if (value.startsWith('!')) {
        ninList.push( new RegExp(escapeRegex(value.substr(1)), 'i'));
      }
      else {
        inList.push(new RegExp(escapeRegex(value), 'i'));
      }
    }

    if ( inList.length > 0 && ninList.length > 0) {
      query.event_value  = { $in: inList, $nin: ninList };
    }
    else if (inList.length > 0) {
      query.event_value  = { $in: inList };
    }
    else {
      query.event_value  = { $nin: ninList };
    }

  }

  if (request.query.freetext) {
    query.event_free_text = new RegExp(request.query.freetext, 'i');
  }

  if (request.query.fulltext) {

    if (typeof request.query.fulltext === 'string') {
      request.query.fulltext = [request.query.fulltext]; // Convert string to array
    }

    const inList = [];
    const ninList = [];

    for ( const fulltext of request.query.fulltext ) {
      if (fulltext.startsWith('!')) {
        ninList.push(new RegExp(fulltext.substr(1), 'i'));
      }
      else {
        inList.push(new RegExp(fulltext, 'i'));
      }
    }

    if ( inList.length > 0 && ninList.length > 0) {
      query.$or = [
        { event_value: { $in: inList } },
        { event_free_text: { $in: inList } },
        { event_options: { $elemMatch: { event_option_value: { $in: inList } } } }
      ];
      query.$and = [
        { event_value: { $nin: ninList } }
        // { event_free_text: { $nin: ninList } },
        // { event_options: { $elemMatch: { event_option_value: { $nin: ninList } } } }
      ];
    }
    else if (inList.length > 0) {
      query.$or = [
        { event_value: { $in: inList } },
        { event_free_text: { $in: inList } },
        { event_options: { $elemMatch: { event_option_value: { $in: inList } } } }
      ];
    }
    else if (ninList.length > 0) {
      query.$and = [
        { event_value: { $nin: ninList } }
        // { event_free_text: { $nin: ninList } },
        // { event_options: { $elemMatch: { event_option_value: { $nin: ninList } } } }
      ];
    }
  }

  //Time filtering
  if (request.query.startTS) {
    const tempStartTS = new Date(request.query.startTS);
    // const startTS = (tempStartTS >= new Date() || tempStartTS >= start_ts && tempStartTS <= stop_ts) ? tempStartTS : start_ts;
    const startTS = (tempStartTS >= start_ts && tempStartTS <= stop_ts) ? tempStartTS : start_ts;
    query.ts = { $gte: startTS };
  }
  else {
    query.ts = { $gte: start_ts };
  }

  if (request.query.stopTS) {
    const tempStopTS = new Date(request.query.stopTS);
    // const stopTS = (tempStopTS >= new Date() || tempStopTS >= start_ts && tempStopTS <= stop_ts) ? tempStopTS : stop_ts;
    const stopTS = (tempStopTS >= start_ts && tempStopTS <= stop_ts) ? tempStopTS : stop_ts;
    query.ts = { $lte: stopTS };
  }
  else {
    query.ts = { $lte: stop_ts };
  }

  // console.log('query:', JSON.stringify(query, null, '  '));

  return query;
};

const escapeRegex = (string) => {

  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
};

const filePreProcessor = (filePath, recordType) => {

  const recordTypes = ['cruises', 'event_aux_data', 'events', 'event_templates', 'lowerings', 'users'];

  function* processRecords(records, recordType) { // eslint-disable-line func-style, no-shadow

    for (const record of records) {

      if (record.id && !ObjectId.isValid(record.id)) {
        throw new Error(`Invalid id: ${record.id}`);
      }

      if (record.id) {
        record._id = new ObjectId(record.id);
        delete record.id;
      }

      if (['cruises','lowerings'].includes(recordType)) {
        try {
          record.start_ts = new Date(record.start_ts);
          record.stop_ts = new Date(record.stop_ts);
        }
        catch {
          throw new Error(`Invalid start/stop timestamps: ${record.start_ts}, ${record.start_ts}`);
        }
      }

      if (recordType === 'events') {
        try {
          record.ts = new Date(record.ts);
        }
        catch {
          throw new Error(`Invalid ts: ${record.ts}`);
        }
      }

      if (recordType === 'event_aux_data') {
        try {
          record.event_id = new ObjectId(record.event_id);
        }
        catch {
          throw new Error(`Invalid event_id: ${record.event_id}`);
        }
      }

      if (recordType === 'users') {
        record.last_login = new Date();
        record.loginToken = randomAsciiString(20);
        record.password = hashedPassword(record.password);
      }

      yield record;
    }
  }

  if (!recordTypes.includes(recordType)) {
    throw new Error(`String '${recordType}' not found in the list.`);
  }

  try {
    const jsonData = Fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(jsonData);
    const recordGenerator = processRecords(data, recordType);

    const processedRecords = [];
    for (const record of recordGenerator) {
      processedRecords.push(record);
    }

    return processedRecords;

  }
  catch (err) {
    console.error('Error during import:', err);
  }
};

const flattenEventObjs = (event_objs) => {

  const flat_events = event_objs.map((event) => {

    const copied_event = Deepcopy(event);
    copied_event.id = event.id; // weird bug where the original objectID doesn't copy.
    copied_event.event_free_text = copied_event.event_free_text.replace('\n','\\n');

    let enumerator = 0;
    if (copied_event.aux_data) {

      copied_event.aux_data.map((data) => {

        data.data_array.map((data2) => {

          const elementName = `${data.data_source}.${data2.data_name}`;
          const elementUOM = `${data.data_source}.${data2.data_name}`;

          if (!(elementName + '_value' in copied_event)) {
            copied_event[elementName + '_value'] = data2.data_value;
            copied_event[elementUOM + '_uom'] = data2.data_uom;
          }
          else {
            enumerator = 2;
            while (enumerator > 1) {
              if (!(elementName + '_' + enumerator  + '_value' in copied_event)) {
                copied_event[elementName + '_' + enumerator + '_value'] = data2.data_value;
                copied_event[elementUOM + '_' + enumerator + '_uom'] = data2.data_uom;
                enumerator = 1;
              }
              else {
                enumerator++;
              }
            }
          }
        });
      });
      delete copied_event.aux_data;
    }

    enumerator = 0;
    copied_event.event_options.map((data) => {

      const elementName = `event_option.${data.event_option_name}`;
      if (!(elementName in copied_event)) {
        copied_event[elementName] = data.event_option_value;
      }
      else {
        enumerator = 2;
        while (enumerator > 1) {
          if (!(elementName + '_' + enumerator in copied_event)) {
            copied_event[elementName + '_' + enumerator] = data.event_option_value;
            enumerator = 1;
          }
          else {
            enumerator++;
          }
        }
      }
    });

    delete copied_event.event_options;

    copied_event.ts = copied_event.ts.toISOString();
    copied_event.id = copied_event.id.toString('hex');
    copied_event.event_free_text = copied_event.event_free_text.replace(/"/g, '"');
    return copied_event;
  });

  return flat_events;
};

const hashedPassword = (password) => {

  return hashSync( password, saltRounds );

};

const mvFilesToDir = (sourcePath, destPath, createIfMissing = false) => {

  try {
    Fs.statSync(destPath).isDirectory();
  }
  catch (error) {
    if (error && error.code === 'ENOENT' && createIfMissing) {

      // If directory does not exist, try to create it
      Fs.mkdirSync(destPath, { recursive: true });
    }
    else {
      throw error;
    }
  }

  const files = Fs.readdirSync(sourcePath);
  for (const file of files) {
    const sourceFilePath = sourcePath + '/' + file;
    const destFilePath = destPath + '/' + file;
    if (Fs.statSync(sourceFilePath).isDirectory()) {
      mvFilesToDir(sourceFilePath, destFilePath);
    }
    else {
      try {
        Fs.renameSync(sourceFilePath, destFilePath );
      }
      catch (error) {
        if (error.code === 'EXDEV') {
          Fs.copyFileSync(sourceFilePath, destFilePath);
          Fs.unlinkSync(sourceFilePath);
        }
        else {
          throw error;
        }
      }
    }
  }

  rmPath(sourcePath);
};

const randomAsciiString = (length) => {

  return randomString(length,
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
};

const randomString = (length, chars) => {

  if (!chars) {
    throw new Error('Argument \'chars\' is undefined');
  }

  const charsLength = chars.length;
  if (charsLength > 256) {
    throw new Error('Argument \'chars\' should not have more than 256 characters'
      + ', otherwise unpredictability will be broken');
  }

  const random_bytes = randomBytes(length);
  const result = new Array(length);

  let cursor = 0;
  for (let i = 0; i < length; ++i) {
    cursor += random_bytes[i];
    result[i] = chars[cursor % charsLength];
  }

  return result.join('');
};

const rmPath = (path) => {

  try {
    const files = Fs.readdirSync(path);

    for (const file of files) {
      const filePath = path + '/' + file;
      if (Fs.statSync(filePath).isDirectory()) {
        rmPath(filePath);
      }
      else {
        Fs.unlinkSync(filePath);
      }
    }
  }
  catch (err) {
    console.error(err);
    throw err;
  }

  try {
    Fs.rmdirSync(path);
  }
  catch (err) {
    console.error(err);
    throw err;
  }
};

module.exports = {
  addEventRecordIDs,
  buildEventCSVHeaders,
  buildEventsQuery,
  filePreProcessor,
  flattenEventObjs,
  hashedPassword,
  mvFilesToDir,
  randomAsciiString,
  randomString,
  rmPath
};
