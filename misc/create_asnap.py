#!/usr/bin/env python3
'''
FILE:           create_asnap.py

DESCRIPTION:    This script generates and submits ASNAP events to the sealog-
                server at a specified interval.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    0.1
CREATED:    2021-07-16
REVISION:   

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2021
'''

import json
import time
import logging
import requests
from datetime import datetime, timedelta

from python_sealog.custom_vars import get_custom_var_by_name
from python_sealog.lowerings import get_lowering_by_id
from python_sealog.settings import API_SERVER_URL, EVENTS_API_PATH, HEADERS

ASNAP_STATUS_VAR_NAME = 'asnapStatus'

DEFAULT_INTERVAL = 10 #seconds

ASNAP_EVENT = {
    "event_value": "ASNAP",
    "event_options": [],
    "event_free_text": ""
}


def asnap_inserter(lowering, interval=DEFAULT_INTERVAL):
    """
    Submit ASNAP events to the sealog-server at the specified interval
    """

    interval_td = timedelta(seconds=interval)
    start_dt = datetime.strptime(lowering['start_ts'], '%Y-%m-%dT%H:%M:%S.%fZ')
    stop_dt = datetime.strptime(lowering['stop_ts'], '%Y-%m-%dT%H:%M:%S.%fZ')
    current_dt = start_dt.replace(second=0, microsecond=0)

    while current_dt < stop_dt:

        current_dt += interval_td
        try:
            ASNAP_EVENT['ts'] = current_dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')
            logging.info("Submitting ASNAP Event: %s", ASNAP_EVENT['ts'])
            logging.debug(json.dumps(ASNAP_EVENT, indent=2))
            requests.post(API_SERVER_URL + EVENTS_API_PATH, headers=HEADERS, data = json.dumps(ASNAP_EVENT))

        except Exception as error:
            logging.error("Error submitting new ASNAP event: %s", json.dumps(ASNAP_EVENT))
            logging.debug(str(error))


# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == '__main__':

    import argparse
    import os
    import sys

    parser = argparse.ArgumentParser(description='ASNAP event submission service')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-i', '--interval', default=DEFAULT_INTERVAL, type=int, help='ASNAP interval in seconds.')
    parser.add_argument('lowering_id', help='The lowering to process (i.e. S0314)')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    logging.info("Interval set to %s seconds.", parsed_args.interval)

    lowering = get_lowering_by_id(parsed_args.lowering_id)

    if not lowering:
        logging.debug("ERROR: lowering %s not found", parsed_args.lowering_id)
        sys.exit(1)

    try:
        asnap_inserter(lowering, parsed_args.interval)
    except KeyboardInterrupt:
        print('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0) # pylint: disable=protected-access
