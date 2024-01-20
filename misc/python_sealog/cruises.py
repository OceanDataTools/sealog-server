#!/usr/bin/env python3
'''
FILE:           cruises.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server cruise routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, CRUISES_API_PATH

def get_cruise(cruise_uid, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a cruise record based on the cruise_id.  Returns the record as a json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + CRUISES_API_PATH + '/' + cruise_uid
        req = requests.get(url, headers=headers, params=params)

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


def get_cruises(export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return all cruise records.  Returns the records as json objects by default
    Set export_format to 'csv' to return the records in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + CRUISES_API_PATH
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


def get_cruise_uid_by_id(cruise_id, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the UID for a cruise record based on the cruise_id.
    '''

    params = {
        'cruise_id': cruise_id
    }

    try:
        url = api_server_url + CRUISES_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            cruise = json.loads(req.text)[0]

            return cruise['id']

    except Exception as error:
        logging.error(str(error))
        raise error

    return None


def get_cruise_by_id(cruise_id, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the cruise record based on the cruise_id.  Returns the records as json
    object by default.  Set export_format to 'csv' to return the record in csv
    format.
    '''

    params = {
        'cruise_id': cruise_id,
        'format': export_format
    }

    try:
        url = api_server_url + CRUISES_API_PATH
        req = requests.get(url, headers=headers, params=params)

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


def get_cruise_by_lowering(lowering_uid, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the cruise record that contains the lowering whose uid is
    lowering_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + CRUISES_API_PATH + '/bylowering/' + lowering_uid
        req = requests.get(url, headers=headers, params=params)

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


def get_cruise_by_event(event_uid, export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the cruise record that contains the event whose uid is
    event_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + CRUISES_API_PATH + '/byevent/' + event_uid
        req = requests.get(url, headers=headers, params=params)

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
