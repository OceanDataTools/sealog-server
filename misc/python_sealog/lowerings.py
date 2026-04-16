#!/usr/bin/env python3
'''
FILE:           lowerings.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server lowering routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, LOWERINGS_API_PATH
from misc.python_sealog._request import _request, _parse


def get_lowering_uid_by_id(lowering_id, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the UID for a lowering record based on the lowering_id.
    '''
    url = api_server_url + LOWERINGS_API_PATH
    result = _parse(_request('GET', url, params={'lowering_id': lowering_id}, headers=headers))
    return result[0]['id'] if result else None


def get_lowerings(export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return all lowering records.  Returns the records as json objects by
    default.  Set export_format to 'csv' to return the records in csv format.
    '''
    url = api_server_url + LOWERINGS_API_PATH
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format, collection=True)


def create_lowering(payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Add a lowering record.
    '''
    url = f'{api_server_url}{LOWERINGS_API_PATH}'
    req = _request('POST', url, payload=payload, headers=headers)
    logging.debug(req.text)


def get_lowering_uids_by_cruise(cruise_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the lowering UIDs for the given cruise_uid.
    '''
    url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
    result = _parse(_request('GET', url, headers=headers), collection=True)
    return [lowering['id'] for lowering in result] if result else []


def get_lowering_ids_by_cruise(cruise_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the lowering_ids for the given cruise_uid.
    '''
    url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
    result = _parse(_request('GET', url, headers=headers), collection=True)
    return [lowering['lowering_id'] for lowering in result] if result else []


def get_lowering(lowering_uid, export_format='json', api_server_url=API_SERVER_URL,
                 headers=HEADERS):
    '''
    Return a lowering record based on the lowering_uid.  Returns the record as
    a json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''
    url = api_server_url + LOWERINGS_API_PATH + '/' + lowering_uid
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format)


def get_lowering_by_id(lowering_id, export_format='json', api_server_url=API_SERVER_URL,
                       headers=HEADERS):
    '''
    Return the lowering record based on the lowering_id.  Returns the record
    as a json object by default.  Set export_format to 'csv' to return the
    record in csv format.
    '''
    url = api_server_url + LOWERINGS_API_PATH
    result = _parse(
        _request('GET', url, params={'lowering_id': lowering_id, 'format': export_format},
                 headers=headers),
        export_format
    )
    if export_format == 'json':
        return result[0] if result else None
    return result


def get_lowerings_by_cruise(cruise_uid, export_format='json', api_server_url=API_SERVER_URL,
                            headers=HEADERS):
    '''
    Return the lowering records for the cruise whose uid is cruise_uid.
    Returns the records as json objects by default.  Set export_format to
    'csv' to return the records in csv format.
    '''
    url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format, collection=True)


def get_lowering_by_event(event_uid, export_format='json', api_server_url=API_SERVER_URL,
                          headers=HEADERS):
    '''
    Return the lowering record containing the event whose uid is event_uid.
    Returns the record as a json object by default.  Set export_format to
    'csv' to return the record in csv format.
    '''
    url = f'{api_server_url}{LOWERINGS_API_PATH}/byevent/{event_uid}'
    return _parse(_request('GET', url, params={'format': export_format}, headers=headers),
                  export_format)


def update_lowering(lowering_uid, payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Update the lowering record.
    '''
    url = f'{api_server_url}{LOWERINGS_API_PATH}/{lowering_uid}'
    _request('PATCH', url, payload=payload, headers=headers)
