#!/usr/bin/env python3
'''
FILE:           delete_aux_data_records.py

DESCRIPTION:    Deletes aux_data records based on array of ids

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    0.1
CREATED:    2022-06-01
REVISION:   

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import json
import logging
import requests

API_SERVER_URL = 'http://localhost:8000/sealog-server'

EVENT_AUX_DATA_API_PATH = '/api/v1/events'

TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIl0sInJvbGVzIjpbImFkbWluIiwiZXZlbnRfd2F0Y2hlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X21hbmFnZXIiLCJjcnVpc2VfbWFuYWdlciIsInRlbXBsYXRlX21hbmFnZXIiXSwiaWF0IjoxNjUzOTkxOTgzfQ.THGhGqv4ydJa2jCyZCuJkC83OLDE6wNoxwxUPhaQzCk'

HEADERS = {
  "authorization": TOKEN
}

def main(uid_file, dry_run):
    logging.info("Starting main function.")
    logging.info(dry_run)

    uids = []

    with open(uid_file) as file:
        try:
            uids = json.load(file)
        except Exception as err:
            logging.error("Unable to import ids from file")
            raise err

    for uid in uids:
        logging.info("Removing aux_data record: %s", uid)
        url = API_SERVER_URL + EVENT_AUX_DATA_API_PATH + '/' + uid
        logging.debug("URL: %s", url)
        # if not dry_run:
        #     req = requests.delete(url, headers=HEADERS)


# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == "__main__":

    import argparse
    import os
    import sys

    parser = argparse.ArgumentParser(description='Aux Data Deleter')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-n', '--dry-run', dest='dry_run', action='store_true', default=False)
    parser.add_argument('id_file', help='File containing json array of ids.')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])
  
    # Run the main function
    try:
        main(parsed_args.id_file, parsed_args.dry_run)
    except KeyboardInterrupt:
        logging.warning('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0) # pylint: disable=protected-access