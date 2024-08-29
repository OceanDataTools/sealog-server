#!/usr/bin/env python3
'''
FILE:           lowerings.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server lowering routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, LOWERINGS_API_PATH


def get_lowering_uid_by_id(lowering_id, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the UID for a lowering record based on the lowering_id.
    '''

    params = {
        'lowering_id': lowering_id
    }

    try:
        url = api_server_url + LOWERINGS_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            lowering = json.loads(req.text)[0]
            return lowering['id']

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowerings(export_format='json', api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return all lowering records.  Returns the records as json objects by
    default.  Set export_format to 'csv' to return the records in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + LOWERINGS_API_PATH
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

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowering_uids_by_cruise(cruise_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the lowering UIDs for the given cruise_uid
    '''

    try:
        url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers)

        if req.status_code == 200:
            lowerings = json.loads(req.text)
            return (lowering['id'] for lowering in lowerings)

        if req.status_code == 404:
            return []

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowering_ids_by_cruise(cruise_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return the lowering_ids for the given cruise_uid
    '''

    try:
        url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers)

        if req.status_code == 200:
            lowerings = json.loads(req.text)
            return (lowering['lowering_id'] for lowering in lowerings)

        if req.status_code == 404:
            return []

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowering(lowering_uid, export_format='json', api_server_url=API_SERVER_URL,
                 headers=HEADERS):
    '''
    Return a lowering record based on the lowering_id.  Returns the record as a
    json object by default.  Set export_format to 'csv' to return the record in
    csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + LOWERINGS_API_PATH + '/' + lowering_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowering_by_id(lowering_id, export_format='json', api_server_url=API_SERVER_URL,
                       headers=HEADERS):
    '''
    Return the lowering record based on the lowering_id.  Returns the records
    as json object by default.  Set export_format to 'csv' to return the record
    in csv format.
    '''

    params = {
        'lowering_id': lowering_id,
        'format': export_format
    }

    try:
        url = api_server_url + LOWERINGS_API_PATH
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)[0]

            if export_format == 'csv':
                return req.text

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowerings_by_cruise(cruise_uid, export_format='json', api_server_url=API_SERVER_URL,
                            headers=HEADERS):
    '''
    Return the lowering records contained within the cruise whose uid is
    cruise_uid.  Returns the record as a json object by default.  Set
    export_format to 'csv' to return the record in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = api_server_url + LOWERINGS_API_PATH + '/bycruise/' + cruise_uid
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

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_lowering_by_event(event_uid, export_format='json', api_server_url=API_SERVER_URL,
                          headers=HEADERS):
    '''
    Return the lowering record containing the event whose uid is event_uid.
    Returns the record as a json object by default.  Set export_format to 'csv'
    to return the record in csv format.
    '''

    params = {
        'format': export_format
    }

    try:
        url = f'{api_server_url}{LOWERINGS_API_PATH}/byevent/{event_uid}'
        req = requests.get(url, headers=headers, params=params)

        if req.status_code == 200:
            if export_format == 'json':
                return json.loads(req.text)

            if export_format == 'csv':
                return req.text

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None

def update_lowering(lowering_uid, payload, api_server_url=API_SERVER_URL,
                    headers=HEADERS):
    '''
    Update the lowering record
    '''

    try:
        url = f'{api_server_url}{LOWERINGS_API_PATH}/{lowering_uid}'
        requests.patch(url, headers=headers, data=json.dumps(payload))

    except requests.exceptions.RequestException as exc:
        raise exc
