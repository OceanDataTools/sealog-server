#!/usr/bin/env python3
'''
FILE:           cruises.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server cruise routes.

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

from .settings import API_SERVER_URL, HEADERS, CRUISES_API_PATH

def get_cruise(cruise_uid, export_format='json'):
    '''
    Return a cruise record based on the cruise_id.  Returns the record as a json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '/' + cruise_uid + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text
        else:
            return None

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_cruises(export_format='json'):
    '''
    Return all cruise records.  Returns the records as json objects by default
    Set export_format to 'csv' to return the records in csv format.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

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


def get_cruise_uid_by_id(cruise_id):
    '''
    Return the UID for a cruise record based on the cruise_id.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '?cruise_id=' + cruise_id
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            cruise = json.loads(req.text)[0]

            return cruise['id']

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_cruise_by_id(cruise_id, export_format='json'):
    '''
    Return the cruise record based on the cruise_id.  Returns the records as json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '?cruise_id=' + cruise_id + '&format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)[0]

            if export_format == 'csv':
                return req.text
        else:
            return None

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_cruise_by_lowering(lowering_uid, export_format='json'):
    '''
    Return the cruise record that contains the lowering whose uid is
    lowering_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '/bylowering/' + lowering_uid + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text
        else:
            return None

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_cruise_by_event(event_uid, export_format='json'):
    '''
    Return the cruise record that contains the event whose uid is
    event_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    try:
        url = API_SERVER_URL + CRUISES_API_PATH + '/byevent/' + event_uid + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text
        else:
            return None

    except Exception as error:
        logging.error(str(error))
        raise error

    return None
