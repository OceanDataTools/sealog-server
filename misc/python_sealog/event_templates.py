#!/usr/bin/env python3
'''
FILE:           event_templates.py

DESCRIPTION:    This script contains the wrapper functions for the sealog-
                server event_template routes.

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

from misc.python_sealog.settings import API_SERVER_URL, HEADERS, EVENT_TEMPLATES_API_PATH


def get_event_templates(system=True, non_system=True, api_server_url=API_SERVER_URL,
                        headers=HEADERS):
    '''
    Return the event_export for the event with the given event_uid.
    '''

    if not system and not non_system:
        logging.warning("Requesting no system templates and no non-system templates will always result in no templates")
        return []

    try:
        url = api_server_url + EVENT_TEMPLATES_API_PATH
        req = requests.get(url, headers=headers)

        if req.status_code != 404:
            event_templates = json.loads(req.text)

            if not system:
                event_templates = [template for template in event_templates if not template['system_template']]

            if not non_system:
                event_templates = [template for template in event_templates if template['system_template']]

            logging.debug(json.dumps(event_templates))
            return event_templates

        return []

    except requests.exceptions.RequestException as exc:
        logging.error(str(exc))
        raise exc

    except json.JSONDecodeError as exc:
        logging.error(str(exc))
        raise exc

    return []
