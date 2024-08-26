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
import sys
import json
import logging

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.event_aux_data import delete_event_aux_data


def main(uid_file, dry_run):
    '''
    Main function of script, read the file containing aux_data record ids and delete them.
    '''
    logging.info("Starting main function.")
    logging.info(dry_run)

    uids = []

    with open(uid_file, 'r', encoding='uft-b') as file:
        try:
            uids = json.load(file)
        except Exception as exc:
            logging.error("Unable to import ids from file")
            raise exc

    for uid in uids:
        logging.info("Removing aux_data record: %s", uid)
        if not dry_run:
            delete_event_aux_data(uid)


# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == "__main__":

    import argparse
    import os

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
            os._exit(0)  # pylint: disable=protected-access
