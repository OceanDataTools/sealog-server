#!/usr/bin/env python3
'''
FILE:           custom_vars.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server custom_vars routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, CUSTOM_VAR_API_PATH


def get_custom_var(var_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var record based on the var_uid.
    '''

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH + '/' + var_uid
        req = requests.get(url, headers=headers, timeout=0.750)
        logging.debug(req.text)

        if req.status_code != 404:
            custom_var = json.loads(req.text)
            logging.debug(json.dumps(custom_var))
            return custom_var

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_custom_var_uid_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var uid based on the var_name.
    '''

    params = {
        'name': var_name
    }

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH
        req = requests.get(url, headers=headers, params=params, timeout=0.750)
        logging.debug(req.text)

        if req.status_code != 404:
            custom_var = json.loads(req.text)[0]
            return custom_var['id']

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def get_custom_var_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var based on the var_name.
    '''

    params = {
        'name': var_name
    }

    try:
        url = api_server_url + CUSTOM_VAR_API_PATH
        req = requests.get(url, headers=headers, params=params, timeout=0.750)
        logging.debug(req.text)

        if req.status_code != 404:
            return json.loads(req.text)[0]

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return None


def set_custom_var(var_uid, value, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Set the value of the custom_var with the uid of var_uid.
    '''

    try:
        payload = {"custom_var_value": value}
        url = api_server_url + CUSTOM_VAR_API_PATH + '/' + var_uid
        req = requests.patch(url, headers=headers, data=json.dumps(payload), timeout=0.750)
        logging.debug(req.text)

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc
