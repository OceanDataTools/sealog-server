#!/usr/bin/env python3
'''
FILE:           misc.py

DESCRIPTION:    This script contains miscellaneous wrapper functions for the
                sealog-server api routes.

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

from .settings import API_SERVER_URL, API_SERVER_FILE_PATH, HEADERS, EVENT_AUX_DATA_API_PATH

DATA_SOURCE_FILTER = ['vehicleRealtimeFramegrabberData']
IMAGE_PATH = API_SERVER_FILE_PATH + "/images"

def get_framegrab_list_by_lowering(lowering_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Get the list of framegrabs for the given lowering_uid
    '''

    logging.debug("Exporting event data")
    query='&data_source='.join(DATA_SOURCE_FILTER)

    framegrab_filenames = []

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bylowering/' + lowering_uid + '?datasource=' + query
        logging.debug("URL: %s", url)
        req = requests.get(url, headers=headers)

        if req.status_code != 404:
            framegrabs = json.loads(req.text)
            for data in framegrabs:
                for framegrab in data['data_array']:
                    if framegrab['data_name'] == 'filename':
                        framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames

def get_framegrab_list_by_cruise(cruise_uid, api_server_url=API_SERVER_URL, headers=HEADERS):
    '''
    Get the list of framegrabs for the given cruise_uid
    '''

    logging.debug("Exporting event data")
    query='&data_source='.join(DATA_SOURCE_FILTER)

    framegrab_filenames = []

    try:
        url = api_server_url + EVENT_AUX_DATA_API_PATH + '/bycruise/' + cruise_uid + '?datasource=' + query
        logging.debug("URL: %s", url)
        req = requests.get(url, headers=headers)

        if req.status_code != 404:
            framegrabs = json.loads(req.text)
            for data in framegrabs:
                for framegrab in data['data_array']:
                    if framegrab['data_name'] == 'filename':
                        framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames

def get_framegrab_list_by_file(filename):
    '''
    Get the list of framegrabs based on the contents of the given file
    '''

    logging.debug(filename)
    framegrab_filenames = []

    try:
        with open(filename, 'r') as file:
            framegrab_list = json.loads(file.read())

            for data in framegrab_list:
                if data['data_source'] in DATA_SOURCE_FILTER:
                    for framegrab in data['data_array']:
                        if framegrab['data_name'] == 'filename':
                            framegrab_filenames.append(framegrab['data_value'])

    except Exception as error:
        logging.error(str(error))

    return framegrab_filenames
