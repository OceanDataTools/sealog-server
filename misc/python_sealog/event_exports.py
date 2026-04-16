#!/usr/bin/env python3
'''
FILE:           event_exports.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_exports routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    2.0
CREATED:    2021-01-01
REVISION:   2026-04-15

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import sys
import logging

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_EXPORTS_API_PATH
from misc.python_sealog._request import _request, _parse


def _export_params(export_format, add_record_ids, event_filter, start_ts=None, stop_ts=None):
    '''Build the query params dict for event export requests.'''
    event_filter = event_filter or []
    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {'format': export_format, 'add_record_ids': add_record_ids}
    if event_filter:
        params['value'] = event_filter
    if start_ts is not None:
        params['startTS'] = start_ts
    if stop_ts is not None:
        params['stopTS'] = stop_ts
    return params


def get_event_export(event_uid, export_format='json', event_filter=None, add_record_ids=False,
                     api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_export for the event with the given event_uid.
    '''
    url = api_server_url + EVENT_EXPORTS_API_PATH + '/' + event_uid
    params = _export_params(export_format, add_record_ids, event_filter)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, accept_any=True)


def get_event_exports(export_format='json', event_filter=None, start_ts=None, stop_ts=None,
                      add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return all event_exports.  Returns the records as json objects by default.
    Set export_format to 'csv' to return the records in csv format.  Optionally
    set an event_filter to limit the returned events.
    '''
    url = api_server_url + EVENT_EXPORTS_API_PATH
    params = _export_params(export_format, add_record_ids, event_filter, start_ts, stop_ts)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, accept_any=True)


def get_event_exports_by_cruise(cruise_uid, export_format='json', event_filter=None,
                                add_record_ids=False, api_server_url=API_SERVER_URL,
                                headers=HEADERS):
    '''
    Return event_exports for the cruise with the given cruise_uid.  Returns
    the records as json objects by default.  Set export_format to 'csv' to
    return the records in csv format.  Optionally set an event_filter to limit
    the returned events.
    '''
    url = api_server_url + EVENT_EXPORTS_API_PATH + '/bycruise/' + cruise_uid
    params = _export_params(export_format, add_record_ids, event_filter)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, accept_any=True)


def get_event_exports_by_lowering(lowering_uid, export_format='json', event_filter=None,
                                  add_record_ids=False, api_server_url=API_SERVER_URL,
                                  headers=HEADERS):
    '''
    Return event_exports for the lowering with the given lowering_uid.  Returns
    the records as json objects by default.  Set export_format to 'csv' to
    return the records in csv format.  Optionally set an event_filter to limit
    the returned events.
    '''
    url = api_server_url + EVENT_EXPORTS_API_PATH + '/bylowering/' + lowering_uid
    params = _export_params(export_format, add_record_ids, event_filter)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, accept_any=True)
