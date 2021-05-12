#!/usr/bin/env python3
'''
FILE:           lowerings.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server lowering routes.

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

from .settings import API_SERVER_URL, HEADERS, LOWERINGS_API_PATH

def get_lowering_uid_by_id(lowering_id):
    '''
    Return the UID for a lowering record based on the lowering_id.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '?lowering_id=' + lowering_id
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            lowering = json.loads(req.text)[0]
            return lowering['id']

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_lowerings(export_format='json'):
    '''
    Return all lowering records.  Returns the records as json objects by
    default.  Set export_format to 'csv' to return the records in csv format.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '?format=' + export_format
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


def get_lowering_uids_by_cruise(cruise_uid):
    '''
    Return the lowering UIDs for the given cruise_uid
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            lowerings = json.loads(req.text)
            return (lowering['id'] for lowering in lowerings)

        if req.status_code == 404:
            return []

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_lowering_ids_by_cruise(cruise_uid):
    '''
    Return the lowering_ids for the given cruise_uid
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            lowerings = json.loads(req.text)
            return (lowering['lowering_id'] for lowering in lowerings)

        if req.status_code == 404:
            return []

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_lowering(lowering_uid, export_format='json'):
    '''
    Return a lowering record based on the lowering_id.  Returns the record as a
    json object by default.  Set export_format to 'csv' to return the record in
    csv format.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '/' + lowering_uid + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_lowering_by_id(lowering_id, export_format='json'):
    '''
    Return the lowering record based on the lowering_id.  Returns the records
    as json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '?lowering_id=' + lowering_id + '&format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)[0]

            if export_format == 'csv':
                return req.text

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_lowerings_by_cruise(cruise_uid, export_format='json'):
    '''
    Return the lowering records contained within the cruise whose uid is
    cruise_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid + '?format=' + export_format
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


def get_lowering_by_event(event_uid, export_format='json'):
    '''
    Return the lowering record containing the event whose uid is event_uid.
    Returns the record as a json object by default.  Set export_format to 'csv'
    to return the record in csv format.
    '''

    try:
        url = API_SERVER_URL + LOWERINGS_API_PATH + '/byevent/' + event_uid + '?format=' + export_format
        req = requests.get(url, headers=HEADERS)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

    except Exception as error:
        logging.error(str(error))
        raise error

    return None
