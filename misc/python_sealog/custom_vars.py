#!/usr/bin/env python3
'''
FILE:           custom_vars.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server custom_vars routes.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    2.0
CREATED:    2021-01-01
REVISION:   2026-04-15

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''

import sys
import logging

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, CUSTOM_VAR_API_PATH
from misc.python_sealog._request import _request, _parse


def get_custom_var(var_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var record based on the var_uid.
    '''
    url = api_server_url + CUSTOM_VAR_API_PATH + '/' + var_uid
    return _parse(_request('GET', url, headers=headers))


def get_custom_var_uid_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var uid based on the var_name.
    '''
    url = api_server_url + CUSTOM_VAR_API_PATH
    result = _parse(_request('GET', url, params={'name': var_name}, headers=headers))
    return result[0]['id'] if result else None


def get_custom_var_by_name(var_name, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Return a custom_var based on the var_name.
    '''
    url = api_server_url + CUSTOM_VAR_API_PATH
    result = _parse(_request('GET', url, params={'name': var_name}, headers=headers))
    return result[0] if result else None


def set_custom_var(var_uid, value, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Set the value of the custom_var with the uid of var_uid.
    '''
    url = api_server_url + CUSTOM_VAR_API_PATH + '/' + var_uid
    req = _request('PATCH', url, payload={'custom_var_value': value}, headers=headers)
    logging.debug(req.text)
