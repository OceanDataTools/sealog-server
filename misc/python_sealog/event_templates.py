#!/usr/bin/env python3
'''
FILE:           event_templates.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_template routes.

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

from .settings import API_SERVER_URL, HEADERS, EVENT_TEMPLATES_API_PATH

def get_event_templates():
    '''
    Return the event_export for the event with the given event_uid.
    '''

    try:
        url = API_SERVER_URL + EVENT_TEMPLATES_API_PATH
        req = requests.get(url, headers=HEADERS)

        if req.status_code != 404:
            event_templates = json.loads(req.text)
            logging.debug(json.dumps(event_templates))
            return event_templates

        return []

    except Exception as error:
        logging.debug(str(error))
        raise error

    return None
    