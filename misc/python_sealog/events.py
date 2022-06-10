#!/usr/bin/env python3
'''
FILE:           events.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event routes.

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

import sys
import json
import logging
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENTS_API_PATH

def get_event(event_uid, export_format='json', add_record_ids=False, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return an event record based on the event_uid.  Returns the record as a json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    params = {
        'format': export_format,
        'add_record_ids': 'true' if add_record_ids else 'false',
    }
    
    try:
        # url = api_server_url + EVENTS_API_PATH + '/' + event_uid + '?format=' + export_format + '&add_record_ids=' + _add_record_ids
        url = api_server_url + EVENTS_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

            return None

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_events(export_format='json', add_record_ids=False, event_filter=[], startTS=None, stopTS=None, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records based on the cruise_uid.  Returns the records as json
    objects by default.  Set export_format to 'csv' to return the records in
    csv format.  Optionally define an event_filter to filter the returned
    events.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': 'true' if add_record_ids else 'false',
    }

    if event_filter:
        params['value'] = event_filter

    if startTS is not None:
        params['startTS'] = startTS

    if stopTS is not None:
        params['stopTS'] = stopTS

    try:
        url = api_server_url + EVENTS_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

        if req.status_code == 404:
            if export_format == 'json':
                return []

            if export_format == 'csv':
                return ""

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_events_by_cruise(cruise_uid, export_format='json', add_record_ids=False, event_filter=[], api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records based on the cruise_uid.  Returns the records as json
    objects by default.  Set export_format to 'csv' to return the records in
    csv format.  Optionally define an event_filter to filter the returned
    events.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': 'true' if add_record_ids else 'false',
    }

    if event_filter:
        params['value'] = event_filter

    try:
        url = api_server_url + EVENTS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

        if req.status_code == 404:
            if export_format == 'json':
                return []

            if export_format == 'csv':
                return ""

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_events_by_lowering(lowering_uid, export_format='json', add_record_ids=False, event_filter=[], api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records based on the lowering_uid.  Returns the records as
    json objects by default.  Set export_format to 'csv' to return the records
    in csv format.  Optionally define an event_filter to filter the returned
    events.
    '''

    if not isinstance(event_filter, list):
        logging.warning("DEPRECIATED: event_filter should be an array of strings")
        event_filter = [event_filter]

    params = {
        'format': export_format,
        'add_record_ids': 'true' if add_record_ids else 'false',
    }

    if event_filter:
        params['value'] = event_filter

    try:
        url = api_server_url + EVENTS_API_PATH + '/bylowering/' + lowering_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:

            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

        if req.status_code == 404:
            if export_format == 'json':
                return []

            if export_format == 'csv':
                return ""

    except Exception as error:
        logging.error(str(error))
        raise error

    return None
