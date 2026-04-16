#!/usr/bin/env python3
'''
FILE:           event_aux_data.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_aux_data routes.

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
import json
import logging

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_AUX_DATA_API_PATH
from misc.python_sealog._request import _request, _parse


def _aux_data_params(datasource, limit):
    '''Build the query params dict for aux data requests.'''
    datasource = datasource or []
    if not isinstance(datasource, list):
        logging.warning("DEPRECIATED: datasource should be an array of strings")
        datasource = [datasource]

    params = {}
    if datasource:
        params['datasource'] = datasource
    if limit > 0:
        params['limit'] = limit
    return params


def get_event_aux_data_by_cruise(cruise_uid, datasource=None, limit=0,
                                 api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the aux_data records for the given cruise_uid and optional datasource.
    '''
    url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bycruise/' + cruise_uid
    result = _parse(_request('GET', url, params=_aux_data_params(datasource, limit),
                             headers=headers))
    if result is not None:
        logging.debug(json.dumps(result))
    return result


def get_event_aux_data_by_lowering(lowering_uid, datasource=None, limit=0,
                                   api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the aux_data records for the given lowering_uid and optional datasource.
    '''
    url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bylowering/' + lowering_uid
    result = _parse(_request('GET', url, params=_aux_data_params(datasource, limit),
                             headers=headers))
    if result is not None:
        logging.debug(json.dumps(result))
    return result


def create_event_aux_data(payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Add an aux_data record.
    '''
    url = f'{api_server_url}{EVENT_AUX_DATA_API_PATH}'
    req = _request('POST', url, payload=payload, headers=headers)
    logging.debug(req.text)


def delete_event_aux_data(aux_data_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Delete the aux_data record.
    '''
    url = api_server_url + EVENT_AUX_DATA_API_PATH + '/' + aux_data_uid
    _request('DELETE', url, headers=headers)
