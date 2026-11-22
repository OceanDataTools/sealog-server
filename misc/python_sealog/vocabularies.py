#!/usr/bin/env python3
'''
FILE:           vocabularies.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server vocabularies routes (cached NERC Vocabulary Server
                collections).

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2026-11-22
REVISION:   2026-11-22

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import sys

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS
from misc.python_sealog._request import _request, _parse

# Not in settings.py: settings files copied from older templates don't have it
VOCABULARIES_API_PATH = '/api/v1/vocabularies'


def get_vocabularies(api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the vocabularies cached by the server (collection, title, version,
    term_count, ...), or [] if there are none or the server doesn't support
    them.
    '''
    url = api_server_url + VOCABULARIES_API_PATH
    return _parse(_request('GET', url, headers=headers), collection=True) or []


def get_vocabulary_terms(collection, include_deprecated=True, query=None, broader=None,
                         api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the terms of a cached vocabulary, or None if the server doesn't
    have it. Deprecated terms are included unless include_deprecated=False.
    query matches part of a term's label, alternative label, ID or notation;
    broader takes a notation, e.g. SDN:L05::130.
    '''
    url = f'{api_server_url}{VOCABULARIES_API_PATH}/{collection}/terms'
    params = {'include_deprecated': str(include_deprecated).lower()}
    if query:
        params['q'] = query
    if broader:
        params['broader'] = broader

    return _parse(_request('GET', url, params=params, headers=headers))
