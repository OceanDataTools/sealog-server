#!/usr/bin/env python3
'''
FILE:           event_aux_data.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_aux_data routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-01-01
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

import sys
import json
import logging
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_AUX_DATA_API_PATH


def get_event_aux_data_by_cruise(cruise_uid, datasource=None, limit=0,
                                 api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the aux_data records for the given cruise_uid and optional
    datasource.
    '''
    datasource = datasource or []

    if not isinstance(datasource, list):
        logging.warning("DEPRECIATED: datasource should be an array of strings")
        datasource = [datasource]

    params = {}

    if datasource:
        params['datasource'] = datasource

    if limit > 0:
        params['limit'] = limit

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers, params=params, timeout=0.750)

        if req.status_code != 404:
            event_aux_data = json.loads(req.text)
            logging.debug(json.dumps(event_aux_data))
            return event_aux_data

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_event_aux_data_by_lowering(lowering_uid, datasource=None, limit=0,
                                   api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the aux_data records for the given lowering_uid and optional
    datasource.
    '''
    datasource = datasource or []

    if not isinstance(datasource, list):
        logging.warning("DEPRECIATED: datasource should be an array of strings")
        datasource = [datasource]

    params = {}

    if datasource:
        params['datasource'] = datasource

    if limit > 0:
        params['limit'] = limit

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bylowering/' + lowering_uid
        req = requests.get(url, headers=headers, params=params, timeout=0.750)

        event_aux_data = json.loads(req.text)
        logging.debug(json.dumps(event_aux_data))
        return event_aux_data

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc


def create_event_aux_data(payload, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Add an aux_data records.
    '''

    try:
        url = f'{api_server_url}{EVENT_AUX_DATA_API_PATH}'
        req = requests.post(url, headers=headers, data=json.dumps(payload), timeout=0.750)
        logging.debug(req.text)

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc


def delete_event_aux_data(aux_data_uid, api_server_url=API_SERVER_URL,
                          headers=HEADERS):
    '''
    Delete the aux_data records.
    '''

    params = {}

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/' + aux_data_uid
        requests.delete(url, headers=headers, params=params, timeout=0.750)

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc
