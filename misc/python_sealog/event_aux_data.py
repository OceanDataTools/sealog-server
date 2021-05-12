#!/usr/bin/env python3
'''
FILE:           event_aux_data.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_aux_data routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    0.1
CREATED:    2021-01-01
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2021
'''

import json
import logging
import requests

from .settings import API_SERVER_URL, HEADERS, EVENT_AUX_DATA_API_PATH

def get_event_aux_data_by_cruise(cruise_uid, datasource=None):
    '''
    Return the aux_data records for the given cruise_uid and optional
    datasource.
    '''

    try:
        url = API_SERVER_URL + EVENT_AUX_DATA_API_PATH + '/bycruise/' + cruise_uid

        if datasource is not None:
            url += '&datasource=' + datasource

        req = requests.get(url, headers=HEADERS)

        if req.status_code != 404:
            event_aux_data = json.loads(req.text)
            logging.debug(json.dumps(event_aux_data))
            return event_aux_data

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_aux_data_by_lowering(lowering_uid, datasource=''):
    '''
    Return the aux_data records for the given lowering_uid and optional
    datasource.
    '''

    try:
        url = API_SERVER_URL + EVENT_AUX_DATA_API_PATH + '/bylowering/' + lowering_uid

        if datasource != '':
            url += '&datasource=' + datasource

        req = requests.get(url, headers=HEADERS)

        event_aux_data = json.loads(req.text)
        logging.debug(json.dumps(event_aux_data))
        return event_aux_data

    except Exception as error:
        logging.debug(str(error))
        raise error
