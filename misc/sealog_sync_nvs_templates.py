#!/usr/bin/env python3
'''
FILE:           sealog_sync_nvs_templates.py

DESCRIPTION:    Build Sealog event templates whose options are drawn from NERC
                Vocabulary Server (NVS) collections, following the EARS/R2R
                event model (Tool + Process + Action):

                  L22  SeaVoX Device Catalogue      instrument make/model
                  L05  SeaDataNet device categories instrument category
                  L06  SeaVoX Platform Categories   platform
                  EL2  Platform Event Processes     what is happening
                  EL1  Platform Event Actions       the state change

                Each entry in the config file becomes one template:
                  option "Instrument" = the L22/L05 term(s). One term becomes
                                        static text (recorded on every event,
                                        no extra click); several a dropdown.
                  option "Platform"   = the L06 term(s), same rule.
                  option "Process"    = the allowed EL2 terms
                  option "Action"     = the allowed EL1 terms

                Terms are referenced as COLL::ID (e.g. "L22::TOOL0058"), SDN
                notation ("SDN:L22::TOOL0058") or by ID or label within the
                option's default collection (e.g. "InWater" for actions).
                Instrument and platform options also accept terms from local
                vocabularies on the server (e.g. "SKQEQ::ROV-ODYSSEY").
                Terms hidden on the server can't be used.

                Every option records which terms its values came from
                (event_option_vocab), so the server can attach the term IDs
                to events created from these templates.

                Only templates carrying the marker category (default "NVS")
                are created, updated or deleted; hand-built templates are
                never touched.

USAGE:          ./sealog_sync_nvs_templates.py -c nvs_templates.example.json --dry-run
                ./sealog_sync_nvs_templates.py -c nvs_templates.example.json

                Vocabularies come from the Sealog server's cache by default
                (--source server); --source nvs fetches them from NVS
                instead, keeping a local copy for --offline use.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2026-11-22
REVISION:   2026-11-23

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import API_SERVER_URL, TOKEN
from misc.python_sealog.event_templates import (
    get_event_templates, create_event_template, update_event_template, delete_event_template
)
from misc.python_sealog.vocabularies import get_vocabularies, get_vocabulary_terms

NVS_URL = 'https://vocab.nerc.ac.uk/collection/{collection}/current/'
NVS_QUERY = '?_profile=nvs&_mediatype=application/ld+json'

# config key -> (default option name, default collection for bare refs,
#                allowed collections)
OPTION_SPECS = [
    ('instrument', 'Instrument', 'L22', {'L22', 'L05'}),
    ('platform', 'Platform', 'L06', {'L06'}),
    ('processes', 'Process', 'EL2', {'EL2'}),
    ('actions', 'Action', 'EL1', {'EL1'}),
]
ALWAYS = ('EL1', 'EL2')

# Options holding the thing being deployed: a single term is static text
FIXED_IF_SINGLE = ('instrument', 'platform')


# --------------------------------------------------------------------------
# Vocabularies
# --------------------------------------------------------------------------

def _as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _literal(value):
    '''
    JSON-LD literal ({'@value': x}, x, or a list of either) -> plain string,
    preferring English.
    '''
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get('@language', 'en') == 'en':
                return _literal(item)
        return _literal(value[0]) if value else ''
    if isinstance(value, dict):
        return value.get('@value', '')
    return value or ''


def _uri_to_notation(uri):
    '''
    http://vocab.nerc.ac.uk/collection/L05/current/130/ -> SDN:L05::130
    '''
    parts = uri.rstrip('/').split('/collection/')
    if len(parts) != 2:
        return None
    bits = parts[1].split('/')
    return f'SDN:{bits[0]}::{bits[2]}' if len(bits) >= 3 else None


def _linked_notations(value):
    return sorted(filter(None, (_uri_to_notation(link['@id']) for link in _as_list(value)
                                if isinstance(link, dict) and '@id' in link)))


def fetch_nvs_collection(collection, timeout=180):
    '''
    Fetch a collection from NVS as {collection, title, uri, version, fetched,
    concepts: {id: term}}.
    '''
    url = NVS_URL.format(collection=collection) + NVS_QUERY
    resp = requests.get(url, headers={'Accept': 'application/ld+json'}, timeout=timeout)
    resp.raise_for_status()

    vocab = {'collection': collection, 'title': collection,
             'uri': NVS_URL.format(collection=collection), 'version': '',
             'fetched': datetime.now(timezone.utc).isoformat(timespec='seconds'),
             'concepts': {}}

    for node in resp.json().get('@graph', []):
        types = _as_list(node.get('@type'))
        if 'skos:Concept' in types:
            notation = _literal(node.get('skos:notation'))
            term_id = notation.split('::')[-1]
            vocab['concepts'][term_id] = {
                'id': term_id,
                'notation': notation,
                'uri': node['@id'],
                'prefLabel': _literal(node.get('skos:prefLabel')),
                'altLabel': _literal(node.get('skos:altLabel')),
                'definition': _literal(node.get('skos:definition')),
                'deprecated': str(_literal(node.get('owl:deprecated'))).lower() == 'true',
                'replacedBy': _linked_notations(node.get('dc:isReplacedBy')),
                'broader': _linked_notations(node.get('skos:broader')),
            }
        elif 'skos:Collection' in types:
            vocab['title'] = _literal(node.get('dc:title')) or collection
            vocab['version'] = _literal(node.get('owl:versionInfo'))

    if not vocab['concepts']:
        raise RuntimeError(f'No terms found in NVS collection {collection}')
    return vocab


def load_nvs_vocabs(collections, cache_path, offline=False):
    '''
    Return {collection: vocab} fetched from NVS. Anything NVS can't supply
    (or everything, when offline) comes from the cache file.
    '''
    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding='utf-8') as cache_file:
            cache = json.load(cache_file)

    changed = False
    for collection in sorted(collections):
        if offline:
            continue
        try:
            logging.info('Fetching %s from NVS', collection)
            cache[collection] = fetch_nvs_collection(collection)
            changed = True
        except (requests.RequestException, RuntimeError) as err:
            logging.warning('NVS fetch of %s failed (%s); using the cache', collection, err)

    missing = sorted(set(collections) - set(cache))
    if missing:
        sys.exit(f'ERROR: no copy of {", ".join(missing)} (NVS unreachable and not in '
                 f'{cache_path}; local vocabularies need --source server)')

    if changed:
        with open(cache_path, 'w', encoding='utf-8') as cache_file:
            json.dump(cache, cache_file)

    return {collection: cache[collection] for collection in collections}


def load_server_vocabs(collections, api_server_url, headers):
    '''
    Return {collection: vocab} from the Sealog server's vocabulary cache.
    '''
    cached = {vocab['collection']: vocab for vocab in get_vocabularies(api_server_url, headers)}

    missing = sorted(set(collections) - set(cached))
    if missing:
        sys.exit(f'ERROR: the server has no copy of {", ".join(missing)}; refresh or import '
                 'it on the server, or use --source nvs')

    vocabs = {}
    for collection in collections:
        terms = get_vocabulary_terms(collection, include_hidden=True,
                                     api_server_url=api_server_url, headers=headers) or []
        vocabs[collection] = {**cached[collection],
                              'concepts': {term['id']: term for term in terms}}
    return vocabs


# --------------------------------------------------------------------------
# Template construction
# --------------------------------------------------------------------------

def split_ref(ref, default_collection):
    '''
    'SDN:L22::TOOL0058' / 'L22::TOOL0058' -> ('L22', 'TOOL0058');
    a bare 'act16' / 'InWater' -> (default_collection, ref).
    '''
    ref = ref.strip()
    if '::' in ref:
        collection, term_id = ref.rsplit('::', 1)
        return collection.replace('SDN:', ''), term_id
    return default_collection, ref


def resolve(vocab, key):
    '''
    Look a term up by ID, then by label or alternative label (ignoring case).
    '''
    concepts = vocab['concepts']
    if key in concepts:
        return concepts[key]
    lowered = key.lower()
    for concept in concepts.values():
        if lowered in (concept['prefLabel'].lower(), (concept['altLabel'] or '').lower()):
            return concept
    raise KeyError(f"'{key}' not found in {vocab['collection']}")


def collections_needed(config):
    '''
    The collections the config refers to.
    '''
    collections = set(ALWAYS)
    for entry in config['instruments']:
        for key, _, default_collection, _ in OPTION_SPECS:
            refs = entry.get(key)
            if refs in (None, 'all'):
                continue
            for ref in _as_list(refs):
                collections.add(split_ref(ref, default_collection)[0])
    return collections


def option_value(concept, value_format):
    '''
    The text an option shows (and stores on events) for a term.
    '''
    if value_format == 'label_notation':
        return f"{concept['prefLabel']} [{concept['notation']}]"
    return concept['prefLabel']


def option_vocab(concepts, values, vocabs):
    '''
    event_option_vocab for an option built from concepts.
    '''
    # SDN:L22::TOOL0058 -> L22; local terms look like SKQ:SKQEQ::ROV-ODYSSEY
    collections = sorted({concept['notation'].split('::')[0].split(':')[-1]
                          for concept in concepts})
    terms = []
    for value, concept in zip(values, concepts):
        term = {'value': value, 'notation': concept['notation']}
        if concept.get('uri'):  # local terms have none
            term['uri'] = concept['uri']
        terms.append(term)

    vocab = {'collection': ','.join(collections), 'terms': terms}
    if len(collections) == 1 and vocabs[collections[0]].get('version'):
        vocab['version'] = str(vocabs[collections[0]]['version'])
    return vocab


def build_option(name, concepts, opts, fixed_if_single, vocabs):
    '''
    An event template option offering concepts.
    '''
    values = [option_value(concept, opts['value_format']) for concept in concepts]
    option = {
        'event_option_name': name,
        'event_option_type': opts['option_type'],
        'event_option_values': values,
        'event_option_allow_freeform': False,
        'event_option_required': opts['required'],
    }
    if fixed_if_single and len(values) == 1:
        option.update({
            'event_option_type': 'static text',
            'event_option_default_value': values[0],
            'event_option_values': [],
            'event_option_required': False,
        })
    option['event_option_vocab'] = option_vocab(concepts, values, vocabs)
    return option


def resolve_refs(entry, key, default_collection, allowed, vocabs):
    '''
    Resolve an entry's refs for one option to concepts. Returns (concepts,
    errors).
    '''
    refs = entry.get(key)
    if refs == 'all':
        usable = [term_id for term_id, concept in vocabs[default_collection]['concepts'].items()
                  if not concept['deprecated'] and not concept.get('hidden')]
        refs = sorted(usable, key=lambda term_id: int(''.join(filter(str.isdigit, term_id)) or 0))

    # Local vocabularies hold vessel-specific instruments and platforms
    if key in FIXED_IF_SINGLE:
        allowed = allowed | {collection for collection, vocab in vocabs.items()
                             if vocab.get('source') == 'local'}

    concepts, errors = [], []
    for ref in _as_list(refs):
        collection, term_id = split_ref(ref, default_collection)
        if collection not in allowed:
            errors.append(f"{entry['name']}: '{ref}' is {collection}; '{key}' accepts "
                          f"{', '.join(sorted(allowed))}")
            continue
        try:
            concept = resolve(vocabs[collection], term_id)
        except KeyError as err:
            errors.append(f"{entry['name']}: {err.args[0]}")
            continue
        if concept.get('hidden'):
            errors.append(f"{entry['name']}: {concept['notation']} ({concept['prefLabel']}) "
                          'is hidden on this server')
        elif concept['deprecated']:
            hint = ''
            if concept['replacedBy']:
                hint = f"; replaced by {', '.join(concept['replacedBy'])}"
            errors.append(f"{entry['name']}: {concept['notation']} ({concept['prefLabel']}) "
                          f"is deprecated{hint}")
        concepts.append(concept)
    return concepts, errors


def build_options(entry, defaults, vocabs):
    '''
    The vocabulary options for one config entry. Returns (options, errors,
    notations used).
    '''
    opts = {
        'option_type': entry.get('option_type', defaults.get('option_type', 'dropdown')),
        'value_format': entry.get('value_format', defaults.get('value_format', 'label')),
        'required': entry.get('options_required', defaults.get('options_required', True)),
    }

    options, errors, used = [], [], set()
    for key, default_name, default_collection, allowed in OPTION_SPECS:
        concepts, option_errors = resolve_refs(entry, key, default_collection, allowed, vocabs)
        errors.extend(option_errors)
        if not concepts:
            continue
        used.update(concept['notation'] for concept in concepts)
        name = entry.get(f'{key}_option_name', defaults.get(f'{key}_option_name', default_name))
        options.append(build_option(name, concepts, opts, key in FIXED_IF_SINGLE, vocabs))

    return options, errors, used


def build_template(entry, config, vocabs):
    '''
    The event template for one config entry. Returns (template, errors,
    notations used).
    '''
    defaults = config.get('defaults', {})
    options, errors, used = build_options(entry, defaults, vocabs)
    options.extend(entry.get('extra_options', []))

    marker = config.get('marker_category', 'NVS')
    template = {
        'event_name': entry['name'],
        'event_value': entry.get('event_value', entry['name']),
        'event_free_text_required': entry.get('free_text_required',
                                              defaults.get('free_text_required', False)),
        'system_template': False,
        'disabled': entry.get('disabled', False),
        'admin_only': entry.get('admin_only', False),
        'template_categories': list(dict.fromkeys(
            [marker] + defaults.get('template_categories', []) +
            entry.get('template_categories', []))),
        'event_options': options,
    }
    color = entry.get('button_color', defaults.get('button_color'))
    if color:
        template['event_button_color'] = color
    return template, errors, used


def build_templates(config, vocabs):
    '''
    The event templates for every config entry. Returns (templates, errors,
    notations used).
    '''
    templates, errors, used = [], [], set()
    for entry in config['instruments']:
        template, entry_errors, entry_used = build_template(entry, config, vocabs)
        templates.append(template)
        errors.extend(entry_errors)
        used |= entry_used
    return templates, errors, used


def build_lookup(vocabs, used, value_format):
    '''
    Map option value -> notation/URI/definition (and L05 category for L22
    devices), for post-processing exports. EL1/EL2 are included in full,
    device and platform collections only for the terms the config uses.
    '''
    lookup = {'_value_format': value_format}
    for collection, vocab in vocabs.items():
        terms = {}
        for concept in vocab['concepts'].values():
            if collection not in ALWAYS and concept['notation'] not in used:
                continue
            item = {'notation': concept['notation'], 'uri': concept['uri'],
                    'definition': concept['definition']}
            if collection == 'L22':
                item['category'] = [notation for notation in concept['broader']
                                    if notation.startswith('SDN:L05::')]
            terms[option_value(concept, value_format)] = item
        lookup[collection] = {'title': vocab.get('title'), 'collection_uri': vocab.get('uri'),
                              'collection_version': vocab.get('version'),
                              'fetched': vocab.get('fetched'), 'terms': terms}
    return lookup


# --------------------------------------------------------------------------
# Sync
# --------------------------------------------------------------------------

def sync(templates, marker, prune, api_server_url, headers):
    '''
    Create or update the templates on the server; with prune, delete managed
    templates no longer in the config.
    '''
    existing = get_event_templates(api_server_url=api_server_url, headers=headers)
    managed = {template['event_name']: template for template in existing
               if marker in (template.get('template_categories') or [])}
    unmanaged = {template['event_name'] for template in existing} - set(managed)

    for template in templates:
        name = template['event_name']
        if name in managed:
            update_event_template(managed[name]['id'], template, api_server_url, headers)
            print(f'updated  {name}')
        elif name in unmanaged:
            logging.warning("SKIPPED %s: a template with this name exists without the '%s' "
                            "category; rename one of them", name, marker)
        else:
            create_event_template(template, api_server_url, headers)
            print(f'created  {name}')

    if prune:
        wanted = {template['event_name'] for template in templates}
        for name, template in managed.items():
            if name not in wanted:
                delete_event_template(template['id'], api_server_url, headers)
                print(f'deleted  {name}')


# --------------------------------------------------------------------------
# The main loop of the utility
# --------------------------------------------------------------------------

def parse_args():
    '''
    Command line arguments.
    '''
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('-v', '--verbosity', default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-c', '--config', required=True, help='instrument config JSON')
    parser.add_argument('--url', default=API_SERVER_URL,
                        help='Sealog server base URL (default: %(default)s)')
    parser.add_argument('--token', default=os.environ.get('SEALOG_TOKEN', TOKEN),
                        help='Sealog JWT (default: $SEALOG_TOKEN, else python_sealog settings)')
    parser.add_argument('--source', choices=['server', 'nvs'], default='server',
                        help="where to read vocabularies (default: %(default)s)")
    parser.add_argument('--cache', default='nvs_vocab_cache.json',
                        help='local copy of NVS vocabularies for --source nvs '
                        '(default: %(default)s)')
    parser.add_argument('--offline', action='store_true',
                        help='with --source nvs, use the --cache copy only')
    parser.add_argument('--dry-run', action='store_true',
                        help='write the templates to --out instead of syncing them')
    parser.add_argument('--out', default='nvs_event_templates.json',
                        help='templates file for --dry-run (default: %(default)s)')
    parser.add_argument('--lookup-out',
                        help='also write an option value -> notation/URI map to this file')
    parser.add_argument('--prune', action='store_true',
                        help='delete NVS-managed templates no longer in the config')
    return parser.parse_args()


def load_vocabs(args, collections, headers):
    '''
    The vocabularies, from the --source the arguments name.
    '''
    if args.source == 'server':
        return load_server_vocabs(collections, args.url, headers)
    return load_nvs_vocabs(collections, args.cache, offline=args.offline)


def write_json(path, data):
    '''
    Write data to path as indented JSON.
    '''
    with open(path, 'w', encoding='utf-8') as out_file:
        json.dump(data, out_file, indent=2)


def main():
    '''
    Build the templates from the config and sync them to the server.
    '''
    args = parse_args()

    log_levels = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    logging.basicConfig(format='%(asctime)-15s %(levelname)s - %(message)s',
                        level=log_levels[min(args.verbosity, 2)])

    with open(args.config, encoding='utf-8') as config_file:
        config = json.load(config_file)

    token = args.token if args.token.startswith('Bearer ') else f'Bearer {args.token}'
    headers = {'Authorization': token}

    vocabs = load_vocabs(args, collections_needed(config), headers)
    for collection, vocab in sorted(vocabs.items()):
        print(f"{collection} v{vocab.get('version')}: {len(vocab['concepts'])} terms "
              f"(fetched {vocab.get('fetched')})")

    templates, errors, used = build_templates(config, vocabs)
    for error in errors:
        print(f'CONFIG ERROR: {error}', file=sys.stderr)
    if errors:
        sys.exit(1)

    if args.lookup_out:
        value_format = config.get('defaults', {}).get('value_format', 'label')
        write_json(args.lookup_out, build_lookup(vocabs, used, value_format))

    if args.dry_run:
        write_json(args.out, templates)
        print(f'wrote {len(templates)} templates to {args.out}')
        return

    try:
        sync(templates, config.get('marker_category', 'NVS'), args.prune, args.url, headers)
    except requests.RequestException as err:
        sys.exit(f'ERROR: {err}')


if __name__ == '__main__':
    main()
