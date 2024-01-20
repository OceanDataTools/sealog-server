#!/usr/bin/env python3
'''
FILE:           sealog_vessel_data_export.py

DESCRIPTION:    This script exports all the data for a given cruise.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2018-11-07
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import os
import sys
import json
import logging
import subprocess

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import API_SERVER_FILE_PATH
from misc.python_sealog.cruises import get_cruises, get_cruise_by_id
from misc.python_sealog.events import get_events_by_cruise
from misc.python_sealog.event_aux_data import get_event_aux_data_by_cruise
from misc.python_sealog.event_exports import get_event_exports_by_cruise
from misc.python_sealog.event_templates import get_event_templates

EXPORT_ROOT_DIR = '/data/sealog-FKt-export'
VESSEL_NAME = 'R/V Falkor (too)'

OPENVDM_IP='10.23.9.20'
OPENVDM_USER='mt'
OPENVDM_SSH_KEY='/home/mt/.ssh/id_rsa_openvdm'
CRUISEDATA_DIR_ON_DATA_WAREHOUSE='/mnt/soi_data1/vault/CruiseData'
SEALOG_DIR='Falkor_too/Raw/Sealog'

CREATE_DEST_DIR = False

CRUISES_FILE_PATH = os.path.join(API_SERVER_FILE_PATH, 'cruises')

def _verify_source_directories():

    if not os.path.isdir(CRUISES_FILE_PATH):
        return False, "cannot find cruises file path"

    return True, ''


def _build_cruise_export_dirs(cruise):

    logging.info("Building cruise-level export directories")

    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id']))
    except FileExistsError:
        logging.debug("cruise export directory already exists")
    except Exception as err:
        logging.error("Could not create cruise export directory")
        logging.debug(str(err))
        sys.exit(1)


def _export_cruise_sealog_data_files(cruise): #pylint: disable=too-many-statements

    logging.info("Exporting cruise-level data files")

    filename = cruise['cruise_id'] + '_cruiseRecord.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Cruise Record: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(cruise))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_eventOnlyExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Events (json-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_events_by_cruise(cruise['id'])))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_eventOnlyExport.csv'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Events (csv-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(get_events_by_cruise(cruise['id'], 'csv'))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_auxDataExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Aux Data: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_aux_data_by_cruise(cruise['id'])))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_sealogExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Events with Aux Data (json-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_exports_by_cruise(cruise['id'])))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_sealogExport.csv'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Events with Aux Data (csv-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(get_event_exports_by_cruise(cruise['id'], 'csv'))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_eventTemplates.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Event Templates: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_templates()))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))


def _push_2_data_warehouse(cruise): #pylint: disable=redefined-outer-name

    if CREATE_DEST_DIR:
        command = ['ssh', '-i', OPENVDM_SSH_KEY, OPENVDM_USER + '@' + OPENVDM_IP, 'cd ' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id']) + '; test -d ' + SEALOG_DIR + ' || mkdir -p ' + os.path.join(SEALOG_DIR) + '']
        logging.debug(' '.join(command))
        subprocess.call(command)

    command = ['rsync','-trimv','--progress', '--delete', '-e', 'ssh -i ' + OPENVDM_SSH_KEY, os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], ''), OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], SEALOG_DIR, '')]
    logging.debug(' '.join(command))
    subprocess.call(command)


if __name__ == '__main__':

    import argparse

    parser = argparse.ArgumentParser(description='Sealog ' + VESSEL_NAME + ' Data export')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-n', '--no-transfer', action='store_true', default=False, help='build reports and export data but do not push to data warehouse')
    parser.add_argument('-C', '--cruise_id', help='export data for the specified cruise (i.e. SL200329)')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    selected_cruise = None # pylint: disable=invalid-name

    # if exporting a specific current cruise
    if parsed_args.cruise_id:
        selected_cruise = get_cruise_by_id(parsed_args.cruise_id)

    # if exporting the current cruise
    else:
        selected_cruise = next(iter(get_cruises()), None)

    # if no cruise found, exit
    if selected_cruise is None:
        logging.error("Cruise %s not found", parsed_args.cruise_id)
        sys.exit(0)

    # Verify source directories
    success, msg = _verify_source_directories()
    if not success:
        logging.error(msg)
        sys.exit(0)

    # Verify export root directory
    if not os.path.isdir(EXPORT_ROOT_DIR):
        logging.error("cannot find export directory: %s", EXPORT_ROOT_DIR)
        sys.exit(1)

    logging.info("Cruise ID: %s", selected_cruise['cruise_id'])
    if 'cruise_name' in selected_cruise['cruise_additional_meta']:
        logging.info("Cruise Name: %s", selected_cruise['cruise_additional_meta']['cruise_name'])

    # cruise source dir
    cruise_source_dir = os.path.join(CRUISES_FILE_PATH, selected_cruise['id'])

    #verify cruise source directory exists
    try:
        os.path.isdir(cruise_source_dir)
    except Exception as err:
        logging.error('cannot find source directory for cruise: %s', cruise_source_dir)
        logging.debug(str(err))
        sys.exit(1)

    # build cruise export dirs
    _build_cruise_export_dirs(selected_cruise)

    # export cruise data files
    _export_cruise_sealog_data_files(selected_cruise)

    # sync data to data warehouse
    if not parsed_args.no_transfer:
        _push_2_data_warehouse(selected_cruise)

    logging.debug("Done")
