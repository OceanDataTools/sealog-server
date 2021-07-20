#!/usr/bin/env python3
'''
FILE:           custom_vars.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server custom_vars routes.

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

from .settings import API_SERVER_URL, HEADERS, CUSTOM_VAR_API_PATH

def get_custom_var(var_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var record based on the var_uid.
    '''

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH + '/' + var_uid
        req = requests.get(url, headers=headers)
        logging.debug(req.text)

        if req.status_code != 404:
            custom_var = json.loads(req.text)
            logging.debug(json.dumps(custom_var))
            return custom_var

    except Exception as error:
        logging.error('Error retrieving custom variable')
        logging.debug(str(error))
        raise error

    return None


def get_custom_var_uid_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var uid based on the var_name.
    '''

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH + '?name=' + var_name
        req = requests.get(url, headers=headers)
        logging.debug(req.text)

        if req.status_code != 404:
            custom_var = json.loads(req.text)[0]
            return custom_var['id']

    except Exception as error:
        logging.error('Error retrieving custom variable UID')
        logging.debug(str(error))
        raise error

    return None


def get_custom_var_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var based on the var_name.
    '''

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH + '?name=' + var_name
        req = requests.get(url, headers=headers)
        logging.debug(req.text)

        if req.status_code != 404:
            return json.loads(req.text)[0]

    except Exception as error:
        logging.error('Error retrieving custom variable')
        logging.debug(str(error))
        raise error

    return None


def set_custom_var(var_uid, value, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Set the value of the custom_var with the uid of var_uid.
    '''

    try:
        payload = { "custom_var_value": value}
        req = requests.patch(API_SERVER_URL + CUSTOM_VAR_API_PATH + '/' + var_uid, headers=HEADERS, data = json.dumps(payload))
        logging.debug(req.text)

    except Exception as error:
        logging.error('Error setting custom variable')
        logging.debug(str(error))
        raise error
