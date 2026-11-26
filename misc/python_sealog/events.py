#!/usr/bin/env python3
'''
FILE:           events.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENTS_API_PATH
from misc.python_sealog._request import _request, _parse


def _event_params(export_format, add_record_ids, event_filter, start_ts=None, stop_ts=None,
                  limit=None, offset=None, sort=None):
    '''Build the query params dict for event requests.'''
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
    if limit is not None:
        params['limit'] = limit
    if offset is not None:
        params['offset'] = offset
    if sort is not None:
        params['sort'] = sort
    return params


def get_event(event_uid, export_format='json', add_record_ids=False,
              api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return an event record based on the event_uid.  Returns the record as a
    json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''
    url = api_server_url + EVENTS_API_PATH + '/' + event_uid
    params = {'format': export_format, 'add_record_ids': add_record_ids}
    return _parse(_request('GET', url, params=params, headers=headers), export_format)


def get_events(export_format='json', add_record_ids=False, event_filter=None,
               start_ts=None, stop_ts=None, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records.  Returns the records as json objects by default.
    Set export_format to 'csv' to return the records in csv format.  Optionally
    define an event_filter to filter the returned events.
    '''
    url = api_server_url + EVENTS_API_PATH
    params = _event_params(export_format, add_record_ids, event_filter, start_ts, stop_ts)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, collection=True)


def get_events_by_cruise(cruise_uid, export_format='json', add_record_ids=False,
                         event_filter=None, limit=None, offset=None, sort=None,
                         api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records for the given cruise_uid.  Returns the records as
    json objects by default.  Set export_format to 'csv' to return the records
    in csv format.  Optionally define an event_filter to filter the returned
    events.
    '''
    url = api_server_url + EVENTS_API_PATH + '/bycruise/' + cruise_uid
    params = _event_params(export_format, add_record_ids, event_filter, limit=limit, offset=offset,
                           sort=sort)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, collection=True)


def get_events_by_lowering(lowering_uid, export_format='json', add_record_ids=False,
                           event_filter=None, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records for the given lowering_uid.  Returns the records as
    json objects by default.  Set export_format to 'csv' to return the records
    in csv format.  Optionally define an event_filter to filter the returned
    events.
    '''
    url = api_server_url + EVENTS_API_PATH + '/bylowering/' + lowering_uid
    params = _event_params(export_format, add_record_ids, event_filter)
    return _parse(_request('GET', url, params=params, headers=headers),
                  export_format, collection=True)


def delete_event(event_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Delete the event record.
    '''
    url = api_server_url + EVENTS_API_PATH + '/' + event_uid
    _request('DELETE', url, headers=headers)


def update_event(event_uid, payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Update the event record.
    '''
    url = api_server_url + EVENTS_API_PATH + '/' + event_uid
    _request('PATCH', url, payload=payload, headers=headers)
