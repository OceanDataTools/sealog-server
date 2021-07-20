#!/usr/bin/env python3
'''
FILE:           events.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event routes.

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

from .settings import API_SERVER_URL, HEADERS, EVENTS_API_PATH

def get_event(event_uid, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return an event record based on the event_uid.  Returns the record as a json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    try:
        url = api_server_url + EVENTS_API_PATH + '/' + event_uid + '?format=' + export_format
        req = requests.get(url, headers=headers)

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


def get_events_by_cruise(cruise_uid, export_format='json', event_filter='', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records based on the cruise_uid.  Returns the records as json
    objects by default.  Set export_format to 'csv' to return the records in
    csv format.  Optionally define an event_filter to filter the returned
    events.
    '''

    try:
        url = api_server_url + EVENTS_API_PATH + '/bycruise/' + cruise_uid + '?format=' + export_format
        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=headers)

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


def get_events_by_lowering(lowering_uid, export_format='json', event_filter='', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return event records based on the lowering_uid.  Returns the records as
    json objects by default.  Set export_format to 'csv' to return the records
    in csv format.  Optionally define an event_filter to filter the returned
    events.
    '''

    try:
        url = api_server_url + EVENTS_API_PATH + '/bylowering/' + lowering_uid + '?format=' + export_format
        if event_filter != '':
            url += '&value=' + event_filter

        req = requests.get(url, headers=headers)

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
