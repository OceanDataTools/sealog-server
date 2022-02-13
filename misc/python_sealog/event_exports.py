#!/usr/bin/env python3
'''
FILE:           event_export.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_export routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-01-01
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import json
import logging
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_EXPORTS_API_PATH

def get_event_export(event_uid, export_format='json', add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_export for the event with the given event_uid.
    '''

    _add_record_ids = 'true' if add_record_ids else 'false'

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/' + event_uid + '?format=' + export_format + '&add_record_ids=' + _add_record_ids
        req = requests.get(url, headers=headers)

        if req.status_code != 404:
            event = json.loads(req.text)
            logging.debug(json.dumps(event))
            return event

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_cruise(cruise_uid, export_format='json', event_filter='', add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_exports for the cruise with the given cruise_uid.  Returns
    the records as an array of json objects by default.  Set export_format to
    'csv' to return the records in csv format.  Optionally set a event_filter
    that will limit the returns to on the events that match the event_filter.
    '''

    _add_record_ids = 'true' if add_record_ids else 'false'

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/bycruise/' + cruise_uid + '?format=' + export_format + '&add_record_ids=' + _add_record_ids

        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=headers)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_lowering(lowering_uid, export_format='json', event_filter='', add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_exports for the lowering with the given lowering_uid.
    Returns the records as an array of json objects by default.  Set
    export_format to 'csv' to return the records in csv format.  Optionally set
    a event_filter that will limit the returns to on the events that match the
    event_filter.
    '''

    _add_record_ids = 'true' if add_record_ids else 'false'

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/bylowering/' + lowering_uid + '?format=' + export_format + '&add_record_ids=' + _add_record_ids

        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=headers)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None
