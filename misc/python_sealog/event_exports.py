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
                Copyright (C) OceanDataTools.org 2024
'''

import sys
import json
import logging
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_EXPORTS_API_PATH

def get_event_export(event_uid, export_format='json', event_filter=[], add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_export for the event with the given event_uid.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': add_record_ids,
    }

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/' + event_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:
            event = json.loads(req.text)
            logging.debug(json.dumps(event))
            return event

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports(export_format='json', event_filter=[], startTS=None, stopTS=None, add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_exports for the lowering with the given lowering_uid.
    Returns the records as an array of json objects by default.  Set
    export_format to 'csv' to return the records in csv format.  Optionally set
    a event_filter that will limit the returns to on the events that match the
    event_filter.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': add_record_ids,
    }

    if event_filter:
        params['value'] = event_filter

    if startTS is not None:
        params['startTS'] = startTS

    if stopTS is not None:
        params['stopTS'] = stopTS

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_cruise(cruise_uid, export_format='json', event_filter=[], add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_exports for the cruise with the given cruise_uid.  Returns
    the records as an array of json objects by default.  Set export_format to
    'csv' to return the records in csv format.  Optionally set a event_filter
    that will limit the returns to on the events that match the event_filter.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': add_record_ids,
    }

    if event_filter:
        params['value'] = event_filter

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_lowering(lowering_uid, export_format='json', event_filter=[], add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the event_exports for the lowering with the given lowering_uid.
    Returns the records as an array of json objects by default.  Set
    export_format to 'csv' to return the records in csv format.  Optionally set
    a event_filter that will limit the returns to on the events that match the
    event_filter.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': add_record_ids,
    }

    if event_filter:
        params['value'] = event_filter

    try:
        url = api_server_url + EVENT_EXPORTS_API_PATH + '/bylowering/' + lowering_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None
