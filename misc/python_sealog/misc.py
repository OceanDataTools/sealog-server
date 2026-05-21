#!/usr/bin/env python3
'''
FILE:           misc.py

DESCRIPTION:    This script contains miscellaneous wrapper functions for the
                sealog-server api routes.

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
import json
import logging

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_AUX_DATA_API_PATH
from misc.python_sealog._request import _request


def _get_framegrab_list(uid, scope, datasources, api_server_url, headers):
    '''
    Shared implementation for fetching framegrab filenames by lowering or cruise.
    scope should be 'bylowering' or 'bycruise'.
    '''
    logging.info("Building framegrab file list")
    url = f'{api_server_url}{EVENT_AUX_DATA_API_PATH}/{scope}/{uid}'
    req = _request('GET', url, params={'datasource': datasources}, headers=headers)

    filenames = []
    if req.status_code == 404:
        return filenames

    try:
        for data in json.loads(req.text):
            for item in data['data_array']:
                if item['data_name'] == 'filename':
                    filenames.append(item['data_value'])
    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise

    return filenames


def get_framegrab_list_by_lowering(lowering_uid, datasources, api_server_url=API_SERVER_URL,
                                   headers=HEADERS):
    '''
    Get the list of framegrabs for the given lowering_uid.
    '''
    return _get_framegrab_list(lowering_uid, 'bylowering', datasources, api_server_url, headers)


def get_framegrab_list_by_cruise(cruise_uid, datasources, api_server_url=API_SERVER_URL,
                                 headers=HEADERS):
    '''
    Get the list of framegrabs for the given cruise_uid.
    '''
    return _get_framegrab_list(cruise_uid, 'bycruise', datasources, api_server_url, headers)


def get_framegrab_list_by_file(filename, datasources):
    '''
    Get the list of framegrabs based on the contents of the given file.
    '''
    logging.debug(filename)
    filenames = []

    try:
        with open(filename, 'r', encoding='utf-8') as file:
            framegrab_list = json.loads(file.read())

            for data in framegrab_list:
                if data['data_source'] in datasources:
                    for item in data['data_array']:
                        if item['data_name'] == 'filename':
                            filenames.append(item['data_value'])

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise

    return filenames
