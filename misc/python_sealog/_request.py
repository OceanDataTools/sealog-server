#!/usr/bin/env python3
'''
FILE:           _request.py

DESCRIPTION:    Shared HTTP request helpers for the python_sealog API wrappers.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2026-04-15
REVISION:   2026-04-15

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import json
import logging
import sys
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import HEADERS


def _request(method, url, params=None, payload=None, headers=HEADERS):
    '''
    Make an HTTP request to the sealog API.
    Logs and re-raises any connection or timeout errors.
    '''
    try:
        return requests.request(
            method, url,
            headers=headers,
            params=params,
            data=json.dumps(payload) if payload is not None else None,
            timeout=(2, None)
        )
    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise


def _parse(req, export_format='json', collection=False, accept_any=False):
    '''
    Parse a sealog API response into the appropriate Python type.

    - 200 (or any non-404 when accept_any=True): return parsed JSON or raw text.
    - 404 with collection=True: return [] or ''.
    - All other cases: return None.

    accept_any=True is required for endpoints that return 404 when no records
    exist rather than 200 with an empty object/array.  This is the current
    behaviour for event_aux_data, event_exports, event_templates, and
    custom_vars.  Once the API is updated in v2.5 to return 200 + empty data,
    those callers can drop accept_any and this parameter can be removed.

    Logs and re-raises JSONDecodeError on malformed responses.
    '''
    try:
        ok = (req.status_code != 404) if accept_any else (req.status_code == 200)
        if ok:
            return json.loads(req.text) if export_format == 'json' else req.text
        if collection and req.status_code == 404:
            return [] if export_format == 'json' else ''
        return None
    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise
