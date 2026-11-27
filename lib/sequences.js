const {
  cruisesTable,
  eventsTable,
  eventTemplatesTable,
  loweringsTable
} = require('../config/db_constants');

// Sequenced IDs (e.g. sample IDs). A sequence formats a counter into an ID:
//   { name: 'sample_id', format: '{lowering_id}-S{n:03}', scope: 'lowering', start: 1 }
// The counter runs separately for each scope key (the cruise_id or
// lowering_id covering the event, or '' for global) and is taken atomically
// when an event is saved, so numbers are never shared or reused.

const sequencesTable = 'sequences';
const sequenceCountersTable = 'sequence_counters';

const SEQUENCE_OPTION_TYPE = 'sequence';
const SCOPES = ['global', 'cruise', 'lowering'];
const TOKEN_PATTERN = /\{([a-z_]+)(?::(\d+))?\}/g;
const FORMAT_TOKENS = ['cruise_id', 'lowering_id', 'yyyy', 'yy', 'mm', 'dd', 'doy', 'n'];

const sequenceError = (code, message) => {

  const err = new Error(message);
  err.code = code;
  return err;
};

// A per-cruise or per-lowering sequence's format needs that scope's ID, or
// each cruise or lowering would issue the same IDs. Returns an error message,
// or null.
const scopeFormatError = (format, scope) => {

  if (scope === 'global' || format.includes(`{${scope}_id}`)) {
    return null;
  }

  return `A sequence numbered per ${scope} needs {${scope}_id} in its format, or every ${scope} would issue the same IDs`;
};

// The format as literal text and tokens, or throws if it isn't valid
const parseFormat = (format) => {

  const parts = [];
  let last = 0;

  for (const match of format.matchAll(TOKEN_PATTERN)) {
    if (match.index > last) {
      parts.push({ text: format.slice(last, match.index) });
    }

    const [, token, width] = match;
    if (!FORMAT_TOKENS.includes(token)) {
      throw sequenceError('BAD_FORMAT', `Unknown format piece {${token}}; use ${FORMAT_TOKENS.map((name) => `{${name}}`).join(', ')}`);
    }

    if (width !== undefined && token !== 'n') {
      throw sequenceError('BAD_FORMAT', `Only {n} takes a width, as in {n:03}`);
    }

    parts.push({ token, width: width === undefined ? 0 : Number(width) });
    last = match.index + match[0].length;
  }

  if (last < format.length) {
    parts.push({ text: format.slice(last) });
  }

  if (parts.some((part) => part.text && /[{}]/.test(part.text))) {
    throw sequenceError('BAD_FORMAT', 'Braces are only allowed around format pieces');
  }

  if (parts.filter((part) => part.token === 'n').length !== 1) {
    throw sequenceError('BAD_FORMAT', 'The format needs the counter {n} exactly once');
  }

  return parts;
};

const pad = (value, width) => String(value).padStart(width, '0');

// The values of the format's pieces (other than {n}) for an event at ts
const contextValues = (ts, scopes) => {

  const date = new Date(ts);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);

  return {
    cruise_id: scopes.cruise && scopes.cruise.cruise_id,
    lowering_id: scopes.lowering && scopes.lowering.lowering_id,
    yyyy: String(date.getUTCFullYear()),
    yy: pad(date.getUTCFullYear() % 100, 2),
    mm: pad(date.getUTCMonth() + 1, 2),
    dd: pad(date.getUTCDate(), 2),
    doy: pad(Math.floor((date.getTime() - startOfYear) / 86400000) + 1, 3)
  };
};

const formatId = (parts, values, n) => {

  return parts.map((part) => {

    if (part.text !== undefined) {
      return part.text;
    }

    return part.token === 'n' ? pad(n, part.width) : values[part.token];
  }).join('');
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The number in an ID written in this format for these values, or null
const parseId = (parts, values, id) => {

  const pattern = parts.map((part) => {

    if (part.text !== undefined) {
      return escapeRegExp(part.text);
    }

    return part.token === 'n' ? '(\\d+)' : escapeRegExp(values[part.token] || '');
  }).join('');

  const match = new RegExp(`^${pattern}$`).exec(id);
  return match ? Number(match[1]) : null;
};

const coveringQuery = (ts) => ({ start_ts: { $lte: ts }, stop_ts: { $gte: ts } });

// The cruise and lowering covering ts, if any
const findScopes = async (db, ts) => {

  const [cruise, lowering] = await Promise.all([
    db.collection(cruisesTable).findOne(coveringQuery(ts), { projection: { cruise_id: 1, start_ts: 1 } }),
    db.collection(loweringsTable).findOne(coveringQuery(ts), { projection: { lowering_id: 1, start_ts: 1 } })
  ]);

  return { cruise, lowering };
};

// The sequence's scope key and format values for an event at ts. Throws
// when the scope, or a cruise or lowering the format names, doesn't cover ts.
const resolveContext = async (db, sequence, ts) => {

  const parts = parseFormat(sequence.format);
  const scopes = await findScopes(db, ts);
  const needed = new Set(parts.map((part) => part.token).filter((token) => ['cruise_id', 'lowering_id'].includes(token)));
  if (sequence.scope !== 'global') {
    needed.add(`${sequence.scope}_id`);
  }

  for (const token of needed) {
    const kind = token.replace('_id', '');
    if (!scopes[kind]) {
      throw sequenceError('NO_SCOPE', `${sequence.name} needs a ${kind}; no ${kind} covers ${new Date(ts).toISOString()}`);
    }
  }

  const values = contextValues(ts, scopes);
  const scope_key = sequence.scope === 'global' ? '' : values[`${sequence.scope}_id`];
  // When the scope began: IDs are only reused within it
  const since = sequence.scope === 'global' ? null : scopes[sequence.scope].start_ts;
  return { parts, values, scope_key, since };
};

const counterFilter = (sequence, scope_key) => ({ sequence: sequence.name, scope_key });

// The number the next ID would get, without taking it
const peekNumber = async (db, sequence, scope_key) => {

  const counter = await db.collection(sequenceCountersTable).findOne(counterFilter(sequence, scope_key));
  return counter ? counter.last + 1 : sequence.start;
};

// Concurrent first uses of a scope both try to insert its counter; the
// unique index lets one win and the other fails with a duplicate key error.
// By then the counter exists, so the retry updates it.
const retryDuplicate = async (write) => {

  try {
    return await write();
  }
  catch (err) {
    if (err.code !== 11000) {
      throw err;
    }

    return await write();
  }
};

// Take the next number atomically
const takeNumber = async (db, sequence, scope_key) => {

  const increment = [{ $set: { last: { $add: [{ $ifNull: ['$last', sequence.start - 1] }, 1] } } }];
  const counter = await retryDuplicate(() => db.collection(sequenceCountersTable).findOneAndUpdate(counterFilter(sequence, scope_key), increment, { upsert: true, returnDocument: 'after' }));

  return counter.last;
};

// Make sure the counter never hands out n again
const passNumber = (db, sequence, scope_key, n) => {

  return retryDuplicate(() => db.collection(sequenceCountersTable).updateOne(counterFilter(sequence, scope_key), { $max: { last: n } }, { upsert: true }));
};

const findSequence = (db, name) => db.collection(sequencesTable).findOne({ name }, { projection: { _id: 0 } });

// The ID the next event at ts would get: { id, n, scope_key, prefix, suffix }.
// prefix and suffix are the ID's text around the number, so a client can
// tell which number a hand-typed ID in the format has.
const previewId = async (db, sequence, ts) => {

  const { parts, values, scope_key } = await resolveContext(db, sequence, ts);
  const n = await peekNumber(db, sequence, scope_key);
  const counter = parts.findIndex((part) => part.token === 'n');

  return {
    id: formatId(parts, values, n),
    n,
    scope_key,
    prefix: formatId(parts.slice(0, counter), values),
    suffix: formatId(parts.slice(counter + 1), values)
  };
};

// Event option names are stored lowercased with underscores (see POST /events)
const optionKey = (name) => name.toLowerCase().replace(/\s+/g, '_');

// A text option's default value can hold sequence IDs as placeholders, with
// text around them, e.g. {seq:ctd_cast}.hex
const SEQUENCE_REF_PATTERN = /\{seq:([A-Za-z0-9_-]{1,64})\}/g;

// The sequence names in a text's placeholders
const sequenceRefs = (text) => [...String(text || '').matchAll(SEQUENCE_REF_PATTERN)].map((match) => match[1]);

// The sequence options of the template(s) with the event's event_value that
// match its options (option name -> { name, newWhen }, the sequence and the
// conditions for a new ID). Throws when matching templates disagree.
const sequenceOptions = async (db, event_value, options) => {

  const templates = await db.collection(eventTemplatesTable).find({
    event_value,
    'event_options.event_option_type': SEQUENCE_OPTION_TYPE
  }).toArray();

  const found = new Map();
  for (const template of templates) {
    const keys = new Set(template.event_options.map((option) => optionKey(option.event_option_name)));
    if (options.some((option) => !keys.has(option.event_option_name))) {
      continue;
    }

    for (const option of template.event_options) {
      if (option.event_option_type !== SEQUENCE_OPTION_TYPE) {
        continue;
      }

      const key = optionKey(option.event_option_name);
      // A visibility rule on an option the template doesn't have hides nothing
      const visibility = option.event_option_visibility && keys.has(optionKey(option.event_option_visibility.event_option_name || ''))
        ? option.event_option_visibility
        : null;
      const use = { name: option.event_option_sequence, newWhen: option.event_option_sequence_new_when || [], visibility };
      if (found.has(key) && JSON.stringify(found.get(key)) !== JSON.stringify(use)) {
        throw sequenceError('CONFLICT', `Templates with event_value "${event_value}" give option "${key}" different sequences or conditions`);
      }

      found.set(key, use);
    }
  }

  return found;
};

// Most numbers taken in a row while skipping ones already in use
const MAX_SKIPS = 1000;

// Where the sequence's IDs are on events: { event_value, key } for each
// template option that takes IDs from it. Events are matched by both, so an
// option of the same name in another template (or sequence) doesn't count.
const sequenceUses = async (db, name) => {

  const uses = new Map();
  for (const template of await templatesUsingSequence(db, name)) {
    template.event_options
      .filter((option) => option.event_option_type === SEQUENCE_OPTION_TYPE && option.event_option_sequence === name)
      .forEach((option) => {

        const use = { event_value: template.event_value, key: optionKey(option.event_option_name) };
        uses.set(JSON.stringify(use), use);
      });
  }

  return [...uses.values()];
};

// Events with one of the sequence's options holding a value matching
// valueCondition, or null when no template uses the sequence
const usesQuery = (uses, valueCondition) => {

  if (!uses.length) {
    return null;
  }

  return {
    $or: uses.map(({ event_value, key }) => ({
      event_value,
      event_options: { $elemMatch: { event_option_name: key, event_option_value: valueCondition } }
    }))
  };
};

// Whether another event already has the ID in one of the sequence's options
const idInUse = async (db, uses, id, eventId) => {

  const query = usesQuery(uses, id);
  if (!query) {
    return false;
  }

  if (eventId) {
    query._id = { $ne: eventId };
  }

  return Boolean(await db.collection(eventsTable).findOne(query, { projection: { _id: 1 } }));
};

// The values of the event's option named name (any ticked, for checkboxes)
const optionValues = (options, name) => {

  const option = options.find((item) => item.event_option_name === optionKey(name));
  return option && option.event_option_value ? String(option.event_option_value).split(';') : [];
};

// Whether the template's visibility rule hides the option for these values,
// as clients apply it: 'show if' / 'hide if' another option has one of the
// listed values
const isHidden = (visibility, options) => {

  if (!visibility || !['show if', 'hide if'].includes(visibility.show_hide)) {
    return false;
  }

  const matches = optionValues(options, visibility.event_option_name).some((value) => (visibility.event_option_values || []).includes(value));
  return visibility.show_hide === 'show if' ? !matches : matches;
};

// Whether the event's options meet all the conditions for a new ID: each
// names an option whose value (any of them, for checkboxes) is one listed
const meetsConditions = (newWhen, options) => {

  return newWhen.every((condition) => optionValues(options, condition.event_option_name).some((value) => condition.event_option_values.includes(value)));
};

const describeConditions = (newWhen) => {

  return newWhen.map((condition) => `${optionKey(condition.event_option_name)} is ${condition.event_option_values.join(' or ')}`).join(' and ');
};

// The ID on the most recent event before ts (not eventId) with one of the
// sequence's options, since the start of its cruise or lowering covering ts.
// Throws NO_CURRENT when there's none.
const currentId = async (db, sequence, uses, ts, eventId, newWhen = []) => {

  const { since } = await resolveContext(db, sequence, ts);
  const query = usesQuery(uses, { $nin: ['', null] });
  let option = null;
  if (query) {
    query.ts = since ? { $gte: since, $lte: ts } : { $lte: ts };
    if (eventId) {
      query._id = { $ne: eventId };
    }

    const previous = await db.collection(eventsTable).findOne(query, { sort: { ts: -1, _id: -1 }, projection: { event_value: 1, event_options: 1 } });
    const keys = previous ? uses.filter((use) => use.event_value === previous.event_value).map((use) => use.key) : [];
    option = previous && previous.event_options.find((item) => keys.includes(item.event_option_name) && item.event_option_value);
  }

  if (!option) {
    const when = newWhen.length ? `; it takes a new one when ${describeConditions(newWhen)}` : '';
    throw sequenceError('NO_CURRENT', `no current ${sequence.name} ID to reuse${when}`);
  }

  return option.event_option_value;
};

// The ID an event at ts that doesn't take a new one would reuse: { id }
const previewCurrentId = async (db, sequence, ts) => {

  return { id: await currentId(db, sequence, await sequenceUses(db, sequence.name), ts, null) };
};

// Fill in the sequence options of an event being saved, in place. Only
// called when the request sends event_options: a client's empty first step
// (creating the event before its options) takes no number.
// - An option sent empty, or left out, takes the next ID, unless the stored
//   event (previousOptions, on updates) already has one, which it keeps.
//   An option with conditions (event_option_sequence_new_when) takes the
//   next ID only when the event meets them; otherwise it reuses the current
//   one (see currentId).
// - An ID typed by hand is kept as typed, unless it's a new ID (no
//   conditions, or they're met) that another event already has (DUPLICATE);
//   if it's in the sequence's format for the event, the counter moves past it.
// - A number whose ID another event already has (typed by hand for another
//   scope, say) is skipped.
// - An option the template's visibility rule hides for the event's values
//   gets no ID (clients leave hidden options out).
// Then the {seq:name} placeholders in its text options are filled in (see
// fillSequenceRefs).
// Throws (with a message for a 400) when an ID is needed but the sequence's
// cruise or lowering doesn't cover the event. eventId is the event's _id,
// when it has one, so it doesn't count as using its own ID.
const assignSequenceIds = async (db, event_value, ts, options, previousOptions = null, eventId = null) => {

  const sequenced = await sequenceOptions(db, event_value, options);
  const previous = new Map((previousOptions || []).map((option) => [option.event_option_name, option.event_option_value]));

  for (const [key, { name, newWhen, visibility }] of sequenced) {
    const sequence = await findSequence(db, name);
    if (!sequence) {
      throw sequenceError('NO_SEQUENCE', `Option "${key}" takes its ID from sequence ${name}, which doesn't exist on this server`);
    }

    let option = options.find((item) => item.event_option_name === key);
    const value = option ? option.event_option_value : '';
    const stored = previous.get(key);
    const uses = await sequenceUses(db, name);
    const takesNew = !newWhen.length || meetsConditions(newWhen, options);

    if (value) {
      if (value !== stored) {
        if (takesNew && (await idInUse(db, uses, value, eventId))) {
          throw sequenceError('DUPLICATE', `Option "${key}": ${value} is already used by another event`);
        }

        await passTypedId(db, sequence, ts, value);
      }

      continue;
    }

    if (!option) {
      option = { event_option_name: key, event_option_value: '' };
      options.push(option);
    }

    if (stored) {
      option.event_option_value = stored;
      continue;
    }

    // Hidden by the template's visibility rule: the event doesn't have it
    if (isHidden(visibility, options)) {
      options.splice(options.indexOf(option), 1);
      continue;
    }

    if (!takesNew) {
      try {
        option.event_option_value = await currentId(db, sequence, uses, ts, eventId, newWhen);
      }
      catch (err) {
        err.message = `Option "${key}": ${err.message}`;
        throw err;
      }

      continue;
    }

    const { parts, values, scope_key } = await resolveContext(db, sequence, ts);
    let id;
    for (let i = 0; !id; ++i) {
      if (i === MAX_SKIPS) {
        throw sequenceError('EXHAUSTED', `${name}: the next ${MAX_SKIPS} IDs are all used already; set the next number`);
      }

      const candidate = formatId(parts, values, await takeNumber(db, sequence, scope_key));
      if (!(await idInUse(db, uses, candidate, eventId))) {
        id = candidate;
      }
    }

    option.event_option_value = id;
  }

  await fillSequenceRefs(db, event_value, ts, options, sequenced, eventId);
  return options;
};

// The keys of the text options of the template(s) with the event's event_value
const textOptionKeys = async (db, event_value) => {

  const templates = await db.collection(eventTemplatesTable).find(
    { event_value, 'event_options.event_option_type': 'text' },
    { projection: { event_options: 1 } }
  ).toArray();

  const isText = (option) => option.event_option_type === 'text';
  return new Set(templates.flatMap((template) => template.event_options.filter(isText).map((option) => optionKey(option.event_option_name))));
};

// The ID a {seq:name} placeholder takes on an event: its own option on that
// sequence's ID, as just assigned, else the sequence's current ID. null when
// there's none (no current ID yet, or no cruise or lowering covers ts).
const refId = async (db, name, ts, options, sequenced, eventId) => {

  for (const [key, use] of sequenced) {
    const own = use.name === name && options.find((option) => option.event_option_name === key && option.event_option_value);
    if (own) {
      return own.event_option_value;
    }
  }

  const sequence = await findSequence(db, name);
  if (!sequence) {
    return null;
  }

  try {
    return await currentId(db, sequence, await sequenceUses(db, name), ts, eventId);
  }
  catch (err) {
    if (['NO_CURRENT', 'NO_SCOPE'].includes(err.code)) {
      return null;
    }

    throw err;
  }
};

// Fill in the {seq:name} placeholders in the event's text options, in place.
// Clients send a text option's default as is while the logger leaves it, so
// the ID is the one assigned on save. An option with a placeholder that has
// no ID is left out, rather than saved without the ID.
const fillSequenceRefs = async (db, event_value, ts, options, sequenced, eventId) => {

  const withRefs = options.filter((option) => sequenceRefs(option.event_option_value).length);
  if (!withRefs.length) {
    return;
  }

  const textKeys = await textOptionKeys(db, event_value);
  const ids = new Map();

  for (const option of withRefs) {
    if (!textKeys.has(option.event_option_name)) {
      continue;
    }

    let value = option.event_option_value;
    for (const name of new Set(sequenceRefs(value))) {
      if (!ids.has(name)) {
        ids.set(name, await refId(db, name, ts, options, sequenced, eventId));
      }

      value = ids.get(name) === null ? null : value.split(`{seq:${name}}`).join(ids.get(name));
      if (value === null) {
        break;
      }
    }

    if (value === null) {
      options.splice(options.indexOf(option), 1);
    }
    else {
      option.event_option_value = value;
    }
  }
};

// Move the counter past an ID typed by hand, if it's in the format for ts
const passTypedId = async (db, sequence, ts, id) => {

  let context;
  try {
    context = await resolveContext(db, sequence, ts);
  }
  catch (err) {
    if (err.code === 'NO_SCOPE') {
      return;
    }

    throw err;
  }

  // Numbers below start aren't the sequence's to issue, so they don't move it
  const n = parseId(context.parts, context.values, id);
  if (n !== null && n >= sequence.start) {
    await passNumber(db, sequence, context.scope_key, n);
  }
};

// Check the sequence options of a template's options, and clear the values
// they don't use. Returns an error message, or null.
const prepareSequenceOptions = async (db, event_options) => {

  const keys = event_options.map((option) => optionKey(option.event_option_name));

  for (const option of event_options) {
    const name = option.event_option_name;

    if (option.event_option_sequence && option.event_option_type !== SEQUENCE_OPTION_TYPE) {
      return `Option "${name}": only ${SEQUENCE_OPTION_TYPE} options take an event_option_sequence`;
    }

    if (option.event_option_sequence_new_when && option.event_option_type !== SEQUENCE_OPTION_TYPE) {
      return `Option "${name}": only ${SEQUENCE_OPTION_TYPE} options take event_option_sequence_new_when`;
    }

    for (const condition of option.event_option_sequence_new_when || []) {
      const target = optionKey(condition.event_option_name);
      if (target === optionKey(name) || !keys.includes(target)) {
        return `Option "${name}": its new-ID condition names "${condition.event_option_name}", which isn't another option of this template`;
      }
    }

    const refs = sequenceRefs(option.event_option_default_value);
    if (refs.length && option.event_option_type !== 'text') {
      return `Option "${name}": only text options can hold a sequence placeholder ({seq:name}) in their default value`;
    }

    for (const ref of refs) {
      if (!(await findSequence(db, ref))) {
        return `Option "${name}": its default value names sequence ${ref}, which doesn't exist on this server`;
      }
    }

    if (option.event_option_type !== SEQUENCE_OPTION_TYPE) {
      continue;
    }

    if (!option.event_option_sequence) {
      return `Option "${name}": a ${SEQUENCE_OPTION_TYPE} option needs an event_option_sequence`;
    }

    if (!(await findSequence(db, option.event_option_sequence))) {
      return `Option "${name}" takes its ID from sequence ${option.event_option_sequence}, which doesn't exist on this server`;
    }

    option.event_option_values = [];
    option.event_option_default_value = '';
  }

  return null;
};

// Templates with an option on the sequence, or a text option whose default
// value holds a placeholder for it
const templatesUsingSequence = (db, name) => {

  const placeholder = `{seq:${name}}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return db.collection(eventTemplatesTable).find({
    $or: [
      { event_options: { $elemMatch: { event_option_type: SEQUENCE_OPTION_TYPE, event_option_sequence: name } } },
      { event_options: { $elemMatch: { event_option_type: 'text', event_option_default_value: { $regex: placeholder } } } }
    ]
  }).toArray();
};

module.exports = {
  SCOPES,
  SEQUENCE_OPTION_TYPE,
  assignSequenceIds,
  findSequence,
  previewCurrentId,
  scopeFormatError,
  formatId,
  parseFormat,
  parseId,
  previewId,
  prepareSequenceOptions,
  sequenceCountersTable,
  sequenceError,
  sequencesTable,
  templatesUsingSequence
};
