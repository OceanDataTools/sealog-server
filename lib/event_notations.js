const {
  eventTemplatesTable
} = require('../config/db_constants');

const { loadReferences, optionTerms } = require('./template_vocab');

// Event option names are stored lowercased with underscores (see POST /events)
const optionKey = (name) => name.toLowerCase().replace(/\s+/g, '_');

// The notations a template gives the options (name -> notation), or null if
// the event has options the template doesn't define (so it wasn't created
// from it). Checkbox selections arrive, and are stored, joined with ';'.
const templateNotations = (template, options, references) => {

  const templateOptions = new Map(template.event_options.map((option) => [optionKey(option.event_option_name), option]));

  if (options.some((option) => !templateOptions.has(option.event_option_name))) {
    return null;
  }

  const notations = new Map();
  for (const option of options) {
    const templateOption = templateOptions.get(option.event_option_name);
    if (!templateOption.event_option_vocab || option.event_option_notation !== undefined) {
      continue;
    }

    const value = option.event_option_value;
    const values = templateOption.event_option_type === 'checkboxes' && typeof value === 'string' ? value.split(';') : [value];
    const matched = optionTerms(templateOption.event_option_vocab, references).filter((term) => values.includes(term.value));

    if (matched.length) {
      notations.set(option.event_option_name, matched.map((term) => term.notation).join(';'));
    }
  }

  return notations;
};

// Fill in the notations of options sent without one by mapping their values
// through the event template(s) with the event's event_value, in place. Left
// out when those templates map the options differently.
const fillOptionNotations = async (db, event_value, options) => {

  if (!options.some((option) => option.event_option_notation === undefined)) {
    return;
  }

  const templates = await db.collection(eventTemplatesTable).find({
    event_value,
    'event_options.event_option_vocab': { $exists: true }
  }).toArray();

  const references = await loadReferences(db, templates);
  const candidates = new Map();
  for (const template of templates) {
    const notations = templateNotations(template, options, references);
    if (notations && notations.size) {
      candidates.set(JSON.stringify([...notations]), notations);
    }
  }

  if (candidates.size > 1) {
    console.log(`Not mapping vocabulary IDs for event_value "${event_value}": ${candidates.size} templates map its options differently`);
    return;
  }

  const [notations] = candidates.values();
  for (const option of options) {
    if (notations && notations.has(option.event_option_name)) {
      option.event_option_notation = notations.get(option.event_option_name);
    }
  }
};

// Set the notations (vocabulary term IDs) on the event options of a create
// or update payload, in place:
// - an empty notation means none;
// - on updates (previousOptions given), an option sent without a notation
//   keeps its stored one if its value is unchanged, so an unchanged value
//   keeps its term ID even if the term's label has changed since;
// - the rest are mapped from the event's template(s).
const prepareOptionNotations = async (db, event_value, options, previousOptions = null) => {

  const previous = new Map((previousOptions || []).map((option) => [option.event_option_name, option]));

  for (const option of options) {
    if (option.event_option_notation === '') {
      option.event_option_notation = null;
    }
    else if (option.event_option_notation === undefined) {
      const stored = previous.get(option.event_option_name);
      if (stored && stored.event_option_notation && stored.event_option_value === option.event_option_value) {
        option.event_option_notation = stored.event_option_notation;
      }
    }
  }

  try {
    await fillOptionNotations(db, event_value, options);
  }
  catch (err) {
    console.log('Could not map vocabulary IDs:', err);
  }

  // null marked an explicit "none", so it isn't mapped
  for (const option of options) {
    if (!option.event_option_notation) {
      delete option.event_option_notation;
    }
  }

  return options;
};

module.exports = {
  prepareOptionNotations
};
