#!/usr/bin/env python3
'''
FILE:           cruises.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server cruise routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, CRUISES_API_PATH
from misc.python_sealog._request import _request, _parse


def get_cruise(cruise_uid, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a cruise record based on the cruise_uid.  Returns the record as a
    json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''
    url = api_server_url + CRUISES_API_PATH + '/' + cruise_uid
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format)


def get_cruises(export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return all cruise records.  Returns the records as json objects by default.
    Set export_format to 'csv' to return the records in csv format.
    '''
    url = api_server_url + CRUISES_API_PATH
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format, collection=True)


def create_cruise(payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Add a cruise record.
    '''
    url = f'{api_server_url}{CRUISES_API_PATH}'
    req = _request('POST', url, payload=payload, headers=headers)
    logging.debug(req.text)


def get_cruise_uid_by_id(cruise_id, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the UID for a cruise record based on the cruise_id.
    '''
    url = api_server_url + CRUISES_API_PATH
    result = _parse(_request('GET', url, params={'cruise_id': cruise_id}, headers=headers))
    return result[0]['id'] if result else None


def get_cruise_by_id(cruise_id, export_format='json', api_server_url=API_SERVER_URL,
                     headers=HEADERS):
    '''
    Return the cruise record based on the cruise_id.  Returns the record as a
    json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''
    url = api_server_url + CRUISES_API_PATH
    result = _parse(
        _request('GET', url, params={'cruise_id': cruise_id, 'format': export_format},
                 headers=headers),
        export_format
    )
    if export_format == 'json':
        return result[0] if result else None
    return result


def get_cruise_by_lowering(lowering_uid, export_format='json',
                           api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the cruise record that contains the lowering whose uid is
    lowering_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''
    url = api_server_url + CRUISES_API_PATH + '/bylowering/' + lowering_uid
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format)


def get_cruise_by_event(event_uid, export_format='json', api_server_url=API_SERVER_URL,
                        headers=HEADERS):
    '''
    Return the cruise record that contains the event whose uid is event_uid.
    Returns the record as a json object by default.  Set export_format to
    'csv' to return the record in csv format.
    '''
    url = api_server_url + CRUISES_API_PATH + '/byevent/' + event_uid
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format)


def update_cruise(cruise_uid, payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Update the cruise record.
    '''
    url = f'{api_server_url}{CRUISES_API_PATH}/{cruise_uid}'
    _request('PATCH', url, payload=payload, headers=headers)
