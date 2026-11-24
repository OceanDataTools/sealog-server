const {
  vocabulariesTable,
  vocabularyTermsTable,
  visibilityOf,
  isHidden,
  templatesUsing
} = require('./vocabularies');

// Event template options can take their values from a vocabulary:
//   event_option_vocab: { collection: 'L22', terms: ['TOOL0058', ...] }
// terms is optional (every term shown on this install). The values are the
// term labels, filled in whenever templates are returned, so they follow
// the vocabulary: hidden, deprecated and deleted terms drop out.

const VOCAB_OPTION_TYPES = ['dropdown', 'radio buttons', 'checkboxes', 'static text'];

const referencedCollections = (templates) => {

  const collections = new Set();
  for (const template of templates) {
    for (const option of template.event_options || []) {
      if (option.event_option_vocab) {
        collections.add(option.event_option_vocab.collection);
      }
    }
  }

  return [...collections];
};

// The vocabularies the templates reference: collection -> { visibility, terms (id -> term) }
const loadReferences = async (db, templates) => {

  const collections = referencedCollections(templates);
  const references = new Map();

  if (!collections.length) {
    return references;
  }

  const vocabularies = await db.collection(vocabulariesTable).find({ collection: { $in: collections } }).toArray();
  vocabularies.forEach((vocabulary) => references.set(vocabulary.collection, { visibility: visibilityOf(vocabulary), terms: new Map() }));

  const terms = await db.collection(vocabularyTermsTable).find(
    { collection: { $in: collections } },
    { projection: { _id: 0, collection: 1, id: 1, notation: 1, prefLabel: 1, deprecated: 1 } }
  ).toArray();

  for (const term of terms) {
    const reference = references.get(term.collection);
    if (reference) {
      reference.terms.set(term.id, term);
    }
  }

  return references;
};

// The terms an option offers, as { id, value, notation }: shown on this
// install, not deprecated, and in the option's list when it has one (in
// that order; otherwise by label). Duplicate labels get the ID appended.
const optionTerms = (vocab, references) => {

  const reference = references.get(vocab.collection);
  if (!reference) {
    return [];
  }

  const candidates = vocab.terms
    ? vocab.terms.map((id) => reference.terms.get(id)).filter(Boolean)
    : [...reference.terms.values()].sort((a, b) => a.prefLabel.localeCompare(b.prefLabel));

  const offered = candidates.filter((term) => !term.deprecated && !isHidden(reference.visibility, term.id));

  const labelCounts = new Map();
  offered.forEach((term) => labelCounts.set(term.prefLabel, (labelCounts.get(term.prefLabel) || 0) + 1));

  return offered.map((term) => ({
    id: term.id,
    value: labelCounts.get(term.prefLabel) > 1 ? `${term.prefLabel} (${term.id})` : term.prefLabel,
    notation: term.notation
  }));
};

const expandOption = (option, references) => {

  if (!option.event_option_vocab) {
    return option;
  }

  const terms = optionTerms(option.event_option_vocab, references);
  const values = terms.map((term) => term.value);

  // event_option_notations lines up with event_option_values so clients can
  // send the notation of the value picked (event_option_notation on events).
  // Static text has no values: its one notation goes with the default value.
  if (option.event_option_type === 'static text') {
    return { ...option, event_option_values: [], event_option_notations: terms.slice(0, 1).map((term) => term.notation), event_option_default_value: values[0] || '' };
  }

  // A default whose term is no longer offered is cleared. Clients keep
  // checkbox defaults as a comma-separated list.
  const defaultValue = option.event_option_default_value || '';
  const event_option_default_value = option.event_option_type === 'checkboxes'
    ? defaultValue.split(',').map((value) => value.trim()).filter((value) => values.includes(value)).join(', ')
    : (values.includes(defaultValue) ? defaultValue : '');

  return { ...option, event_option_values: values, event_option_notations: terms.map((term) => term.notation), event_option_default_value };
};

// Fill in the values of vocabulary-backed options, in place
const expandTemplates = async (db, templates) => {

  const references = await loadReferences(db, templates);

  if (references.size) {
    for (const template of templates) {
      template.event_options = (template.event_options || []).map((option) => expandOption(option, references));
    }
  }

  return templates;
};

// Check the vocabulary references in a template's options and clear the
// values they replace. Returns an error message, or null.
const prepareOptions = async (db, event_options) => {

  const options = event_options.filter((option) => option.event_option_vocab);
  if (!options.length) {
    return null;
  }

  const references = await loadReferences(db, [{ event_options: options }]);

  for (const option of options) {
    const { collection, terms } = option.event_option_vocab;
    const name = option.event_option_name;

    if (!VOCAB_OPTION_TYPES.includes(option.event_option_type)) {
      return `Option "${name}": only ${VOCAB_OPTION_TYPES.join(', ')} options can take values from a vocabulary`;
    }

    const reference = references.get(collection);
    if (!reference) {
      return `Option "${name}" takes its values from vocabulary ${collection}, which isn't installed on this server`;
    }

    const unknown = (terms || []).filter((id) => !reference.terms.has(id));
    if (unknown.length) {
      return `Option "${name}": ${unknown.length === 1 ? 'term' : 'terms'} ${unknown.join(', ')} ${unknown.length === 1 ? 'isn\'t' : 'aren\'t'} in vocabulary ${collection} on this server`;
    }

    if (option.event_option_type === 'static text') {
      if (!terms || terms.length !== 1) {
        return `Option "${name}": static text takes exactly one term`;
      }

      option.event_option_default_value = '';
    }

    option.event_option_values = [];
  }

  return null;
};

// Re-send the templates using a vocabulary after it changes, as PATCH
// /event_templates does, so clients pick up the new option values
const publishTemplatesUsing = async (server, db, collection) => {

  const templates = await expandTemplates(db, await templatesUsing(db, collection));

  for (const { _id, ...template } of templates) {
    delete template.disabled;
    server.publish('/ws/status/updateEventTemplates', { id: _id, ...template });
  }
};

module.exports = {
  VOCAB_OPTION_TYPES,
  loadReferences,
  optionTerms,
  expandTemplates,
  prepareOptions,
  publishTemplatesUsing
};
