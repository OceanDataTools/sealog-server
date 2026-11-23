const {
  eventAuxDataTable,
  eventTemplatesTable
} = require('../config/db_constants');

const { loadReferences, optionTerms } = require('./template_vocab');

const VOCAB_DATA_SOURCE = 'vocab';

// Event option names are stored lowercased with underscores (see POST /events)
const optionKey = (name) => name.toLowerCase().replace(/\s+/g, '_');

// The entries for options that carry their notation (event_option_notation,
// sent by the client from the template's event_option_notations). These are
// recorded as given; checkbox notations are joined with ';'.
const storedEntries = (event) => {

  return (event.event_options || [])
    .filter((option) => option.event_option_notation)
    .flatMap((option) => {

      return option.event_option_notation.split(';').filter(Boolean).map((notation) => ({
        data_name: option.event_option_name,
        data_value: notation,
        data_uom: 'notation'
      }));
    });
};

// The vocabulary entries a template gives an event, or null if the event has
// options the template doesn't define (so it wasn't created from it). Options
// named in skip already carry their notation and aren't mapped.
const templateEntries = (template, event, references, skip) => {

  const templateOptions = new Map(template.event_options.map((option) => [optionKey(option.event_option_name), option]));
  const eventValues = new Map(event.event_options.map((option) => [option.event_option_name, option.event_option_value]));

  if ([...eventValues.keys()].some((name) => !templateOptions.has(name))) {
    return null;
  }

  const entries = [];
  for (const [name, option] of templateOptions) {
    if (!option.event_option_vocab || skip.has(name)) {
      continue;
    }

    const terms = optionTerms(option.event_option_vocab, references);

    // Static text is fixed by the template, so it's mapped even when the
    // client didn't send it. Checkbox selections arrive joined with ';'.
    const value = eventValues.has(name) ? eventValues.get(name) : (option.event_option_type === 'static text' && terms.length ? terms[0].value : undefined);
    const values = option.event_option_type === 'checkboxes' && typeof value === 'string' ? value.split(';') : [value];

    for (const term of terms) {
      if (values.includes(term.value)) {
        entries.push({ data_name: name, data_value: term.notation, data_uom: 'notation' });
      }
    }
  }

  return entries;
};

// Build the 'vocab' aux_data record holding the vocabulary IDs of the event's
// option values. Options that carry an event_option_notation are recorded as
// given. The rest (events from clients that don't send notations) are mapped
// from the event template(s) with the event's event_value, and left out when
// those templates disagree. Returns null when there's nothing to record.
const buildVocabAuxData = async (db, event) => {

  const stored = storedEntries(event);
  const skip = new Set(stored.map((entry) => entry.data_name));

  const templates = await db.collection(eventTemplatesTable).find({
    event_value: event.event_value,
    'event_options.event_option_vocab': { $exists: true }
  }).toArray();

  const references = await loadReferences(db, templates);
  const candidates = new Map();
  for (const template of templates) {
    const entries = templateEntries(template, event, references, skip);
    if (entries && entries.length) {
      candidates.set(JSON.stringify(entries), entries);
    }
  }

  let mapped = [];
  if (candidates.size > 1) {
    console.log(`Not mapping vocabulary IDs for event ${event._id}: ${candidates.size} templates with event_value "${event.event_value}" map its options differently`);
  }
  else if (candidates.size === 1) {
    [mapped] = candidates.values();
  }

  const entries = [...stored, ...mapped];
  return entries.length ? { event_id: event._id, data_source: VOCAB_DATA_SOURCE, data_array: entries } : null;
};

// Tidy the notations on the event options of a create or update payload, in
// place. An empty notation means none. On updates (previousOptions given),
// an option sent without a notation keeps its stored one if its value is
// unchanged, so clients that don't know about notations don't drop them;
// a changed value without a notation has none.
const prepareOptionNotations = (options, previousOptions = null) => {

  const previous = new Map((previousOptions || []).map((option) => [option.event_option_name, option]));

  for (const option of options) {
    if (option.event_option_notation === '') {
      delete option.event_option_notation;
    }
    else if (option.event_option_notation === undefined) {
      const stored = previous.get(option.event_option_name);
      if (stored && stored.event_option_notation && stored.event_option_value === option.event_option_value) {
        option.event_option_notation = stored.event_option_notation;
      }
    }
  }

  return options;
};

const publishable = (record) => {

  const { _id, ...rest } = record;
  return { id: _id, ...rest };
};

const optionValue = (event, name) => {

  const option = (event.event_options || []).find((eventOption) => eventOption.event_option_name === name);
  return option ? option.event_option_value : undefined;
};

// Existing entries to keep: options whose value hasn't changed since
// previousEvent but no longer maps to a term (e.g. its label changed on a
// refresh, or the term was hidden), so the event keeps its term ID.
const retainedEntries = (entries, existing, event, previousEvent) => {

  if (!existing || !previousEvent) {
    return [];
  }

  const mapped = new Set(entries.map((entry) => entry.data_name));
  return existing.data_array.filter((entry) => {

    const value = optionValue(event, entry.data_name);
    return !mapped.has(entry.data_name) && value !== undefined && value === optionValue(previousEvent, entry.data_name);
  });
};

// Create, update or delete the event's 'vocab' aux_data record to match its
// current options. publishNew says whether a newly created record should be
// broadcast (the caller applies its THRESHOLD rule); updates and deletes are
// always broadcast. previousEvent (on updates) is the event before the
// change, used to keep the IDs of unchanged values.
const syncVocabAuxData = async (server, db, event, publishNew = true, previousEvent = null) => {

  const auxData = db.collection(eventAuxDataTable);
  const built = await buildVocabAuxData(db, event);
  const existing = await auxData.findOne({ event_id: event._id, data_source: VOCAB_DATA_SOURCE });

  const entries = built ? built.data_array : [];
  const data_array = [...entries, ...retainedEntries(entries, existing, event, previousEvent)];
  const record = data_array.length ? { event_id: event._id, data_source: VOCAB_DATA_SOURCE, data_array } : null;

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
  prepareOptionNotations,
  syncVocabAuxData
};
