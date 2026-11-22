const Boom = require('@hapi/boom');

const {
  authorizationHeader,
  localTermCreatePayload,
  localTermDeleteResponse,
  localTermUpdatePayload,
  termVisibilityPayload,
  vocabulariesResponse,
  vocabularyBundle,
  vocabularyCreatePayload,
  vocabularyExportQuery,
  vocabularyResponse,
  vocabularySourcePayload,
  vocabularyVisibility,
  vocabularyImportResponse,
  vocabularyParam,
  vocabularyTermParam,
  vocabularyTermResponse,
  vocabularyTermsQuery,
  vocabularyTermsResponse,
  vocabularyUpdateReport
} = require('../../../lib/validations');

const {
  LOCAL_SOURCE,
  URL_SOURCE,
  addLocalTerm,
  applyVocabulary,
  createLocalVocabulary,
  exportBundle,
  fetchNvsCollection,
  fetchVocabularySource,
  isHidden,
  isLocal,
  removeLocalTerm,
  setTermHidden,
  setVisibility,
  visibilityOf,
  visibleTermsQuery,
  vocabulariesTable,
  vocabularyCollections,
  vocabularyTermsTable
} = require('../../../lib/vocabularies');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const vocabularyError = (err) => {

  if (['VOCABULARY_BUSY', 'VOCABULARY_EXISTS', 'TERM_EXISTS'].includes(err.code)) {
    return Boom.conflict(err.message);
  }

  console.log(err);
  return Boom.serverUnavailable('database error');
};

exports.plugin = {
  name: 'routes-api-vocabularies',
  dependencies: ['hapi-mongodb', '@hapi/nes'],
  register: (server, options) => {

    server.subscription('/ws/status/updateVocabularies');

    const editScope = ['admin', 'write_event_templates'];

    // The vocabulary, or a Boom error if it isn't cached (or isn't local when
    // local is required)
    const findVocabulary = async (db, collection, local = false) => {

      const vocabulary = await db.collection(vocabulariesTable).findOne({ collection }, { projection: { _id: 0 } });

      if (!vocabulary) {
        return { error: Boom.notFound('No vocabulary found for collection: ' + collection) };
      }

      if (local && !isLocal(vocabulary)) {
        const owner = vocabulary.source === URL_SOURCE ? `is pulled from ${vocabulary.source_url}; edit it there` : `is a downloaded vocabulary (source: ${vocabulary.source}); its terms can't be edited`;
        return { error: Boom.conflict(`${collection} ${owner}, or hide terms with PUT /vocabularies/${collection}/visibility`) };
      }

      return { vocabulary };
    };

    // Fetch a vocabulary from its source URL and replace the cached copy
    const pullSource = async (db, collection, url, h) => {

      let vocabulary;
      try {
        vocabulary = await fetchVocabularySource(collection, url);
      }
      catch (err) {
        console.log(`Vocabulary source ${url} for ${collection} failed:`, err.message);
        return err.code === 'VOCABULARY_SOURCE_REFUSED' ? Boom.badRequest(err.message) : Boom.badGateway(`Could not fetch ${collection} from ${url}: ${err.message}`);
      }

      try {
        const report = await applyVocabulary(db, vocabulary, URL_SOURCE);
        publishUpdate(report);
        return h.response(report).code(200);
      }
      catch (err) {
        return vocabularyError(err);
      }
    };

    const publishUpdate = (report) => {

      server.publish('/ws/status/updateVocabularies', {
        collection: report.collection,
        version: report.version,
        source: report.source,
        term_count: report.term_count
      });
    };

    server.route({
      method: 'GET',
      path: '/vocabularies',
      async handler(request, h) {

        const db = request.mongo.db;

        try {
          const results = await db.collection(vocabulariesTable).find({}, { projection: { _id: 0 } }).sort({ collection: 1 }).toArray();

          for (const vocabulary of results) {
            const visibility = visibilityOf(vocabulary);
            vocabulary.visibility_mode = visibility.mode;
            vocabulary.visible_count = await db.collection(vocabularyTermsTable).countDocuments({ collection: vocabulary.collection, ...visibleTermsQuery(visibility) });
            delete vocabulary.visibility;
          }

          return h.response(results).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader
        },
        response: {
          status: {
            200: vocabulariesResponse
          }
        },
        description: 'Return the cached controlled vocabularies',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>\
          <p>Vocabulary content from the NERC Vocabulary Server is licensed under CC BY 4.0</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/vocabularies/{collection}/terms',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection } = request.params;

        try {
          const vocabulary = await db.collection(vocabulariesTable).findOne({ collection });

          if (!vocabulary) {
            return Boom.notFound('No vocabulary found for collection: ' + collection);
          }

          const visibility = visibilityOf(vocabulary);
          const query = { collection };

          if (!request.query.include_deprecated) {
            query.deprecated = false;
          }

          if (!request.query.include_hidden) {
            Object.assign(query, visibleTermsQuery(visibility));
          }

          if (request.query.broader) {
            query.broader = request.query.broader;
          }

          if (request.query.q) {
            const pattern = new RegExp(escapeRegex(request.query.q), 'i');
            query.$or = [{ prefLabel: pattern }, { altLabel: pattern }, { id: pattern }, { notation: pattern }];
          }

          let cursor = db.collection(vocabularyTermsTable)
            .find(query, { projection: { _id: 0 } })
            .collation({ locale: 'en', strength: 2 })
            .sort({ prefLabel: 1 });

          if (request.query.offset) {
            cursor = cursor.skip(request.query.offset);
          }

          if (request.query.limit) {
            cursor = cursor.limit(request.query.limit);
          }

          const terms = await cursor.toArray();
          terms.forEach((term) => {

            term.hidden = isHidden(visibility, term.id);
          });

          return h.response(terms).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam,
          query: vocabularyTermsQuery
        },
        response: {
          status: {
            200: vocabularyTermsResponse
          }
        },
        description: 'Return the terms of a cached vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>\
          <p><strong>q</strong> matches part of the label, alternative label, ID or notation (case-insensitive). \
          <strong>broader</strong> takes a notation, e.g. SDN:L05::130 for the L22 devices in that L05 category. \
          Deprecated terms are left out unless <strong>include_deprecated=true</strong>, \
          and terms hidden on this server unless <strong>include_hidden=true</strong>. \
          An empty array means the vocabulary exists but nothing matched.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/vocabularies/{collection}/terms/{id}',
      async handler(request, h) {

        const db = request.mongo.db;

        try {
          const result = await db.collection(vocabularyTermsTable).findOne(
            { collection: request.params.collection, id: request.params.id },
            { projection: { _id: 0 } }
          );

          if (!result) {
            return Boom.notFound(`No term found for ${request.params.collection}::${request.params.id}`);
          }

          const vocabulary = await db.collection(vocabulariesTable).findOne({ collection: request.params.collection });
          result.hidden = Boolean(vocabulary) && isHidden(visibilityOf(vocabulary), result.id);

          return h.response(result).code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyTermParam
        },
        response: {
          status: {
            200: vocabularyTermResponse
          }
        },
        description: 'Return a single vocabulary term',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/vocabularies/{collection}/refresh',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection } = request.params;

        const existing = await db.collection(vocabulariesTable).findOne({ collection });
        if (existing && existing.source === URL_SOURCE) {
          return await pullSource(db, collection, existing.source_url, h);
        }

        if (!vocabularyCollections.includes(collection)) {
          return Boom.badRequest(`${collection} is not one of the configured NVS collections (${vocabularyCollections.join(', ')}) and has no source URL`);
        }

        let vocabulary;
        try {
          vocabulary = await fetchNvsCollection(collection);
        }
        catch (err) {
          console.log(`Vocabulary refresh of ${collection} failed:`, err.message);
          return Boom.badGateway(`Could not fetch ${collection} from the NERC Vocabulary Server: ${err.message}`);
        }

        try {
          const report = await applyVocabulary(db, vocabulary, 'nvs');
          publishUpdate(report);
          return h.response(report).code(200);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam
        },
        response: {
          status: {
            200: vocabularyUpdateReport
          }
        },
        description: 'Refresh a cached vocabulary from the NERC Vocabulary Server or its source URL',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p>Returns the terms added, newly deprecated and removed, and any event templates mapping values to deprecated or removed terms. \
          If the fetch fails the cached copy is left unchanged.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/vocabularies/export',
      async handler(request, h) {

        const db = request.mongo.db;

        try {
          const bundle = await exportBundle(db, request.query.collection);
          if (request.query.collection && !bundle.vocabularies.length) {
            return Boom.notFound('No vocabulary found for collection: ' + request.query.collection.join(', '));
          }

          const date = bundle.exported.slice(0, 10).replace(/-/g, '');

          return h.response(bundle)
            .header('Content-Disposition', `attachment; filename="sealog-vocabularies-${date}.json"`)
            .code(200);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        validate: {
          headers: authorizationHeader,
          query: vocabularyExportQuery
        },
        description: 'Download a bundle of cached vocabularies',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p>Exports every vocabulary, or only those named with <strong>collection</strong> (repeatable). \
          The bundle can be loaded on another server with POST /vocabularies/import, or hosted for POST /vocabularies/{collection}/source. \
          Per-install visibility and source URLs aren\'t included.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/vocabularies/import',
      async handler(request, h) {

        const db = request.mongo.db;
        const reports = [];

        try {
          for (const vocabulary of request.payload.vocabularies) {
            // A local vocabulary moved by file stays editable on this server
            const report = await applyVocabulary(db, vocabulary, vocabulary.source === LOCAL_SOURCE ? LOCAL_SOURCE : 'import');
            publishUpdate(report);
            reports.push(report);
          }

          return h.response(reports).code(200);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin', 'write_event_templates']
        },
        payload: {
          maxBytes: 50 * 1024 * 1024
        },
        validate: {
          headers: authorizationHeader,
          payload: vocabularyBundle,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            200: vocabularyImportResponse
          }
        },
        description: 'Load a vocabulary bundle',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p>Takes a bundle from GET /vocabularies/export (gzip request bodies are accepted). \
          Each vocabulary in it replaces the cached copy; returns one change report per vocabulary.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'GET',
      path: '/vocabularies/{collection}/visibility',
      async handler(request, h) {

        const { vocabulary, error } = await findVocabulary(request.mongo.db, request.params.collection);
        return error || h.response(visibilityOf(vocabulary)).code(200);
      },
      config: {
        auth: {
          strategy: 'jwt'
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam
        },
        response: {
          status: {
            200: vocabularyVisibility
          }
        },
        description: 'Return which terms of a vocabulary are shown on this server',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>all users</strong></p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'PUT',
      path: '/vocabularies/{collection}/visibility',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection } = request.params;

        try {
          const { error } = await findVocabulary(db, collection);
          if (error) {
            return error;
          }

          const known = await db.collection(vocabularyTermsTable).distinct('id', { collection, id: { $in: request.payload.terms } });
          const unknown = request.payload.terms.filter((id) => !known.includes(id));
          if (unknown.length) {
            return Boom.badRequest(`Unknown ${collection} terms: ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? `, … (${unknown.length} in all)` : ''}`);
          }

          const visibility = await setVisibility(db, collection, request.payload);
          server.publish('/ws/status/updateVocabularies', { collection, visibility_mode: visibility.mode });
          return h.response(visibility).code(200);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam,
          payload: vocabularyVisibility,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            200: vocabularyVisibility
          }
        },
        description: 'Choose which terms of a vocabulary are shown on this server',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p><strong>hide_listed</strong>: every term is shown except the listed ones. \
          <strong>show_only_listed</strong>: only the listed terms are shown, and terms added by later refreshes stay hidden until listed. \
          Visibility is kept across refreshes and imports and isn\'t exported.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/vocabularies/{collection}/terms/{id}/visibility',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection, id } = request.params;

        try {
          const { vocabulary, error } = await findVocabulary(db, collection);
          if (error) {
            return error;
          }

          if (!await db.collection(vocabularyTermsTable).countDocuments({ collection, id })) {
            return Boom.notFound(`No term found for ${collection}::${id}`);
          }

          const visibility = await setTermHidden(db, vocabulary, id, request.payload.hidden);
          server.publish('/ws/status/updateVocabularies', { collection, visibility_mode: visibility.mode });
          return h.response(visibility).code(200);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyTermParam,
          payload: termVisibilityPayload
        },
        response: {
          status: {
            200: vocabularyVisibility
          }
        },
        description: 'Show or hide one vocabulary term on this server',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/vocabularies',
      async handler(request, h) {

        const { collection } = request.payload;

        if (vocabularyCollections.includes(collection)) {
          return Boom.badRequest(`${collection} is one of the configured NVS collections`);
        }

        try {
          const vocabulary = await createLocalVocabulary(request.mongo.db, request.payload);
          server.publish('/ws/status/updateVocabularies', { collection, source: LOCAL_SOURCE, term_count: 0 });
          return h.response(vocabulary).code(201);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          payload: vocabularyCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: vocabularyResponse
          }
        },
        description: 'Create a local vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p>Local vocabularies hold terms this server defines, e.g. vessel-specific equipment that NVS doesn\'t list. \
          Their terms get notations like PREFIX:CODE::ID; <strong>prefix</strong> defaults to the server\'s localVocabularyPrefix setting.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/vocabularies/{collection}/terms',
      async handler(request, h) {

        const db = request.mongo.db;

        try {
          const { vocabulary, error } = await findVocabulary(db, request.params.collection, true);
          if (error) {
            return error;
          }

          const term = await addLocalTerm(db, vocabulary, request.payload);
          server.publish('/ws/status/updateVocabularies', { collection: vocabulary.collection, source: LOCAL_SOURCE });
          return h.response(term).code(201);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam,
          payload: localTermCreatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            201: vocabularyTermResponse
          }
        },
        description: 'Add a term to a local vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p><strong>id</strong> (letters, digits, - and _) can\'t be changed later.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'PATCH',
      path: '/vocabularies/{collection}/terms/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection, id } = request.params;

        try {
          const { error } = await findVocabulary(db, collection, true);
          if (error) {
            return error;
          }

          const result = await db.collection(vocabularyTermsTable).updateOne({ collection, id }, { $set: request.payload });
          if (!result.matchedCount) {
            return Boom.notFound(`No term found for ${collection}::${id}`);
          }

          server.publish('/ws/status/updateVocabularies', { collection, source: LOCAL_SOURCE });
          return h.response().code(204);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyTermParam,
          payload: localTermUpdatePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {}
        },
        description: 'Update a term in a local vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/vocabularies/{collection}/terms/{id}',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection, id } = request.params;

        try {
          const { vocabulary, error } = await findVocabulary(db, collection, true);
          if (error) {
            return error;
          }

          const term = await db.collection(vocabularyTermsTable).findOne({ collection, id });
          if (!term) {
            return Boom.notFound(`No term found for ${collection}::${id}`);
          }

          const action = await removeLocalTerm(db, vocabulary, term);
          server.publish('/ws/status/updateVocabularies', { collection, source: LOCAL_SOURCE });
          return h.response({ id, action }).code(200);
        }
        catch (err) {
          return vocabularyError(err);
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: editScope
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyTermParam
        },
        response: {
          status: {
            200: localTermDeleteResponse
          }
        },
        description: 'Delete a term from a local vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong> or <strong>template_manager</strong></p>\
          <p>A term recorded on events is marked deprecated instead (<strong>action: deprecated</strong>) so those events still resolve.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'POST',
      path: '/vocabularies/{collection}/source',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection } = request.params;

        if (vocabularyCollections.includes(collection)) {
          return Boom.badRequest(`${collection} is one of the configured NVS collections`);
        }

        const existing = await db.collection(vocabulariesTable).findOne({ collection });
        if (existing && isLocal(existing)) {
          return Boom.conflict(`${collection} is a local vocabulary; delete it first or use another code`);
        }

        return await pullSource(db, collection, request.payload.url, h);
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam,
          payload: vocabularySourcePayload,
          failAction: (request, h, err) => {

            throw Boom.badRequest(err.message);
          }
        },
        response: {
          status: {
            200: vocabularyUpdateReport
          }
        },
        description: 'Pull a vocabulary from a URL',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>\
          <p>Fetches a Sealog vocabulary bundle (from GET /vocabularies/export; the vocabulary with this code is used) \
          or an NVS-style SKOS JSON-LD collection, and keeps the URL for later refreshes. \
          The URL\'s host must be listed in the server\'s vocabularySourceHosts setting. \
          The vocabulary is owned by its source: its terms can\'t be edited here, only hidden.</p>',
        tags: ['vocabularies','api']
      }
    });

    server.route({
      method: 'DELETE',
      path: '/vocabularies/{collection}',
      async handler(request, h) {

        const db = request.mongo.db;
        const { collection } = request.params;

        try {
          const result = await db.collection(vocabulariesTable).deleteOne({ collection });

          if (!result.deletedCount) {
            return Boom.notFound('No vocabulary found for collection: ' + collection);
          }

          await db.collection(vocabularyTermsTable).deleteMany({ collection });
          server.publish('/ws/status/updateVocabularies', { collection, deleted: true });

          return h.response().code(204);
        }
        catch (err) {
          console.log(err);
          return Boom.serverUnavailable('database error');
        }
      },
      config: {
        auth: {
          strategy: 'jwt',
          scope: ['admin']
        },
        validate: {
          headers: authorizationHeader,
          params: vocabularyParam
        },
        response: {
          status: {}
        },
        description: 'Delete a cached vocabulary',
        notes: '<p>Requires authorization via: <strong>JWT token</strong></p>\
          <p>Available to: <strong>admin</strong></p>',
        tags: ['vocabularies','api']
      }
    });
  }
};
