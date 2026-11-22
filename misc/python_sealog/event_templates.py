#!/usr/bin/env python3
'''
FILE:           event_templates.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_template routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    2.0
CREATED:    2021-01-01
REVISION:   2026-11-22

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import sys
import logging
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_TEMPLATES_API_PATH
from misc.python_sealog._request import _request, _parse


def get_event_templates(system=True, non_system=True, api_server_url=API_SERVER_URL,
                        headers=HEADERS):
    '''
    Return event templates.  Pass system=False to exclude system templates,
    or non_system=False to exclude non-system templates.
    '''
    if not system and not non_system:
        logging.warning(
            "Requesting no system templates and no non-system "
            "templates will always result in no templates"
        )
        return []

    url = api_server_url + EVENT_TEMPLATES_API_PATH
    result = _parse(_request('GET', url, headers=headers), accept_any=True)
    if result is None:
        return []

    if not system:
        result = [t for t in result if not t['system_template']]
    if not non_system:
        result = [t for t in result if t['system_template']]

    return result


def _raise_for_status(req):
    '''
    Raise requests.HTTPError, including the server's message, on a failed
    request.
    '''
    if not req.ok:
        raise requests.HTTPError(f'{req.request.method} {req.url} -> HTTP {req.status_code}: '
                                 f'{req.text}', response=req)


def create_event_template(payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Add an event template and return its id. Raises requests.HTTPError if the
    server rejects it.
    '''
    url = f'{api_server_url}{EVENT_TEMPLATES_API_PATH}'
    req = _request('POST', url, payload=payload, headers=headers)
    _raise_for_status(req)
    return req.json().get('insertedId')


def update_event_template(template_uid, payload, api_server_url=API_SERVER_URL,
                          headers=HEADERS):
    '''
    Update an event template. Raises requests.HTTPError if the server rejects
    the update.
    '''
    url = f'{api_server_url}{EVENT_TEMPLATES_API_PATH}/{template_uid}'
    _raise_for_status(_request('PATCH', url, payload=payload, headers=headers))


def delete_event_template(template_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Delete an event template. Raises requests.HTTPError if the server refuses.
    '''
    url = f'{api_server_url}{EVENT_TEMPLATES_API_PATH}/{template_uid}'
    _raise_for_status(_request('DELETE', url, headers=headers))
