#!/usr/bin/env python3
'''
FILE:           misc.py

DESCRIPTION:    This script contains miscellaneous wrapper functions for the
                sealog-server api routes.

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

from misc.python_sealog.settings import API_SERVER_URL, API_SERVER_FILE_PATH, HEADERS, EVENT_AUX_DATA_API_PATH

def get_framegrab_list_by_lowering(lowering_uid, datasources, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Get the list of framegrabs for the given lowering_uid
    '''

    logging.info("Building framegrab file list")

    params = {
        'datasource': datasources
    }

    framegrab_filenames = []

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bylowering/' + lowering_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:
            framegrabs = json.loads(req.text)
            for data in framegrabs:
                for framegrab in data['data_array']:
                    if framegrab['data_name'] == 'filename':
                        framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames

def get_framegrab_list_by_cruise(cruise_uid, datasources, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Get the list of framegrabs for the given cruise_uid
    '''

    logging.debug("Exporting event data")

    params = {
        'datasource': datasources
    }

    framegrab_filenames = []

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bycruise/' + cruise_uid
        req = requests.get(url, headers=headers, params=params)

        if req.status_code != 404:
            framegrabs = json.loads(req.text)
            for data in framegrabs:
                for framegrab in data['data_array']:
                    if framegrab['data_name'] == 'filename':
                        framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames

def get_framegrab_list_by_file(filename, datasources):
    '''
    Get the list of framegrabs based on the contents of the given file
    '''

    logging.debug(filename)
    framegrab_filenames = []

    try:
        with open(filename, 'r') as file:
            framegrab_list = json.loads(file.read())

            for data in framegrab_list:
                if data['data_source'] in datasources:
                    for framegrab in data['data_array']:
                        if framegrab['data_name'] == 'filename':
                            framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames
