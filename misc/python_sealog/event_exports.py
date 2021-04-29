#!/usr/bin/env python3
'''
FILE:           event_export.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_export routes.

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

from .settings import API_SERVER_URL, HEADERS, EVENT_EXPORTS_API_PATH

def get_event_export(event_uid):
    '''
    Return the event_export for the event with the given event_uid.
    '''

    try:
        url = API_SERVER_URL + EVENT_EXPORTS_API_PATH + '/' + event_uid
        req = requests.get(url, headers=HEADERS)

        if req.status_code != 404:
            event = json.loads(req.text)
            logging.debug(json.dumps(event))
            return event

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_cruise(cruise_uid, export_format='json', event_filter=''):
    '''
    Return the event_exports for the cruise with the given cruise_uid.  Returns
    the records as an array of json objects by default.  Set export_format to
    'csv' to return the records in csv format.  Optionally set a event_filter
    that will limit the returns to on the events that match the event_filter.
    '''

    try:
        url = API_SERVER_URL + EVENT_EXPORTS_API_PATH + '/bycruise/' + cruise_uid + '?format=' + export_format

        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=HEADERS)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None


def get_event_exports_by_lowering(lowering_uid, export_format='json', event_filter=''):
    '''
    Return the event_exports for the lowering with the given lowering_uid.
    Returns the records as an array of json objects by default.  Set
    export_format to 'csv' to return the records in csv format.  Optionally set
    a event_filter that will limit the returns to on the events that match the
    event_filter.
    '''

    try:
        url = API_SERVER_URL + EVENT_EXPORTS_API_PATH + '/bylowering/' + lowering_uid + '?format=' + export_format

        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=HEADERS)

        if req.status_code != 404:

            if export_format == 'json':
                events = json.loads(req.text)
                return events

            return req.text

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None
