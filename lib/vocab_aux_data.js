const {
  eventAuxDataTable,
  eventTemplatesTable
} = require('../config/db_constants');

const VOCAB_DATA_SOURCE = 'vocab';

// Event option names are stored lowercased with underscores (see POST /events)
const optionKey = (name) => name.toLowerCase().replace(/\s+/g, '_');

// The vocabulary entries a template gives an event, or null if the event has
// options the template doesn't define (so it wasn't created from it).
const templateEntries = (template, event) => {

  const templateOptions = new Map(template.event_options.map((option) => [optionKey(option.event_option_name), option]));
  const eventValues = new Map(event.event_options.map((option) => [option.event_option_name, option.event_option_value]));

  if ([...eventValues.keys()].some((name) => !templateOptions.has(name))) {
    return null;
  }

  const entries = [];
  for (const [name, option] of templateOptions) {
    if (!option.event_option_vocab) {
      continue;
    }

    // Static text is fixed by the template, so it's mapped even when the
    // client didn't send it. Checkbox selections arrive joined with ';'.
    const value = eventValues.has(name) ? eventValues.get(name) : (option.event_option_type === 'static text' ? option.event_option_default_value : undefined);
    const values = option.event_option_type === 'checkboxes' && typeof value === 'string' ? value.split(';') : [value];

    for (const term of option.event_option_vocab.terms) {
      if (values.includes(term.value)) {
        entries.push({ data_name: name, data_value: term.notation, data_uom: 'notation' });
      }
    }
  }

  return entries;
};

// Build the 'vocab' aux_data record holding the vocabulary IDs of the event's
// option values, from the event template(s) with the event's event_value.
// Returns null when there's nothing to record or the templates disagree.
const buildVocabAuxData = async (db, event) => {

  const templates = await db.collection(eventTemplatesTable).find({
    event_value: event.event_value,
    'event_options.event_option_vocab': { $exists: true }
  }).toArray();

  const candidates = new Map();
  for (const template of templates) {
    const entries = templateEntries(template, event);
    if (entries && entries.length) {
      candidates.set(JSON.stringify(entries), entries);
    }
  }

  if (candidates.size > 1) {
    console.log(`Not recording vocabulary IDs for event ${event._id}: ${candidates.size} templates with event_value "${event.event_value}" map its options differently`);
    return null;
  }

  const [entries] = candidates.values();
  return entries ? { event_id: event._id, data_source: VOCAB_DATA_SOURCE, data_array: entries } : null;
};

const publishable = (record) => {

  const { _id, ...rest } = record;
  return { id: _id, ...rest };
};

// Create, update or delete the event's 'vocab' aux_data record to match its
// current options. publishNew says whether a newly created record should be
// broadcast (the caller applies its THRESHOLD rule); updates and deletes are
// always broadcast.
const syncVocabAuxData = async (server, db, event, publishNew = true) => {

  const auxData = db.collection(eventAuxDataTable);
  const record = await buildVocabAuxData(db, event);
  const existing = await auxData.findOne({ event_id: event._id, data_source: VOCAB_DATA_SOURCE });

  if (record && existing) {
    if (JSON.stringify(record.data_array) !== JSON.stringify(existing.data_array)) {
      await auxData.updateOne({ _id: existing._id }, { $set: { data_array: record.data_array } });
      server.publish('/ws/status/updateEventAuxData', publishable({ ...existing, data_array: record.data_array }));
    }
  }
  else if (record) {
    const result = await auxData.insertOne(record);
    if (publishNew) {
      server.publish('/ws/status/newEventAuxData', publishable({ ...record, _id: result.insertedId }));
    }
  }
  else if (existing) {
    await auxData.deleteOne({ _id: existing._id });
    server.publish('/ws/status/deleteEventAuxData', publishable(existing));
  }
};

module.exports = {
  VOCAB_DATA_SOURCE,
  buildVocabAuxData,
  syncVocabAuxData
};
