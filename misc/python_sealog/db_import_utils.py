#!/usr/bin/env python3
'''
FILE:           db_import_utils.py

DESCRIPTION:    Library of utility functions used for importing data directly
                into the database

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2024-07-01
REVISION:   2024-08-25

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

import json
import copy
import logging
from jsonschema import validate

cruise_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "cruise_id": {"type": "string"},
        "start_ts": {"type": "string"},
        "stop_ts": {"type": "string"},
        "cruise_location": {"type": "string"},
        "cruise_tags": {"type": "array"},
        "cruise_hidden": {"type": "boolean"},
        "cruise_additional_meta": {
            "type": "object",
            "properties": {
                "cruise_participants": {"type": "array"},
                "cruise_name": {"type": "string"},
                "cruise_vessel": {"type": "string"},
                "cruise_pi": {"type": "string"},
                "cruise_departure_location": {"type": "string"},
                "cruise_arrival_location": {"type": "string"},
                "cruise_description": {"type": "string"},
                "lowering_files": {"type": "array"}
            },
            "required": ["cruise_vessel", "cruise_pi", "cruise_departure_location", "cruise_arrival_location"],
        }
    },
    "required": ["id", "cruise_id", "start_ts", "stop_ts", "cruise_tags", "cruise_additional_meta"]
}

lowering_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "lowering_id": {"type": "string"},
        "start_ts": {"type": "string"},
        "stop_ts": {"type": "string"},
        "lowering_location": {"type": "string"},
        "lowering_tags": {"type": "array"},
        "lowering_hidden": {"type": "boolean"},
        "lowering_additional_meta": {
            "type": "object",
            "properties": {
                "lowering_description": {"type": "string"},
                "lowering_files": {"type": "array"},
                "milestones": {"type": "object"},
                "stats": {"type": "object"}
            },
            "required": ["milestones", "stats"]
        }
    },
    "required": ["id", "lowering_id", "start_ts", "stop_ts", "lowering_tags", "lowering_additional_meta"]
}

event_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "ts": {"type": "string"},
        "event_author": {"type": "string"},
        "event_value": {"type": "string"},
        "event_free_text": {"type": "string"},
        "event_options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "event_option_name": {"type": "string"},
                    "event_option_value": {"type": "string"},
                },
                "required": ["event_option_name", "event_option_value"]
            }
        },
    },
    "required": ["id", "ts", "event_author", "event_value", "event_free_text", "event_options"]
}

auxData_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "event_id": {"type": "string"},
        "data_source": {"type": "string"},
        "data_array": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "data_name": {"type": "string"},
                    "data_value": {},
                    "data_uom": {"type": "string"},
                },
                "required": ["data_name", "data_value"]
            }
        },
    },
    "required": ["id", "event_id", "data_source", "data_array"]
}


def _convert_record(record):

    try:
        new_record = copy.deepcopy(record)
        new_record['_id'] = {"$oid": record['id']}
        del new_record['id']
        return new_record

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_record) Could not convert record {record['id']}") from exc


def _validate_record(record, record_schema):

    try:
        validate(instance=record, schema=record_schema)

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_validate_record) Could not validate record {record['id']}") from exc


def _convert_cruise_record(record):

    try:
        new_record = _convert_record(record)
        new_record['start_ts'] = {"$date": new_record['start_ts']}
        new_record['stop_ts'] = {"$date": new_record['stop_ts']}

        return new_record

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_cruise_record) Could not convert record {record['id']}") from exc


def _convert_lowering_record(record):

    try:
        new_record = _convert_record(record)
        new_record['start_ts'] = {"$date": new_record['start_ts']}
        new_record['stop_ts'] = {"$date": new_record['stop_ts']}

        return new_record

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_lowering_record) Could not convert record {record['id']}") from exc


def _convert_event_record(record):

    try:
        new_record = _convert_record(record)
        new_record['ts'] = {"$date": new_record['ts']}

        return new_record

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_event_record) Could not convert record {record['id']}") from exc


def _convert_aux_data_record(record):

    try:
        new_record = _convert_record(record)
        new_record['event_id'] = {"$oid": new_record['event_id']}

        return new_record

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_aux_data_record) Could not convert record {record['id']}") from exc


def _convert_record_fn(record_fn, conv_func, validate_func):

    try:
        with open(record_fn, 'r', encoding='utf-8') as record_fp:
            record = json.load(record_fp)

            if isinstance(record, dict):
                record = [record]

            logging.info("Validating record(s)")
            list(map(validate_func, record))

            logging.info("Converting record(s)")
            return list(map(conv_func, record))

    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(_convert_record_fn) Could not convert record {record['id']}") from exc


# --------------------------------------------------------------------------- #
def convert_cruise_record_fn(record_fn):
    '''
    Process the cruise records in the given file ahead of import into the
    database.
    '''

    def _validate_cruise_record(record):
        _validate_record(record, cruise_schema)

    try:
        return _convert_record_fn(record_fn, _convert_cruise_record, _validate_cruise_record)
    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(convert_cruise_record_fn) Could not convert record file {record_fn}") from exc


def convert_lowering_record_fn(record_fn):
    '''
    Process the lowering records in the given file ahead of import into the
    database.
    '''

    def _validate_lowering_record(record):
        _validate_record(record, lowering_schema)

    try:
        return _convert_record_fn(record_fn, _convert_lowering_record, _validate_lowering_record)
    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(convert_lowering_record_fn) Could not convert record file {record_fn}") from exc


def convert_event_record_rn(record_fn):
    '''
    Process the event records in the given file ahead of import into the
    database.
    '''

    def _validate_event_record(record):
        _validate_record(record, event_schema)

    try:
        return _convert_record_fn(record_fn, _convert_event_record, _validate_event_record)
    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(convert_event_record_rn) Could not convert record file {record_fn}") from exc


def convert_aux_data_record_fn(record_fn):
    '''
    Process the aux_data records in the given file ahead of import into the
    database.
    '''

    def _validate_aux_data_record(record):
        _validate_record(record, auxData_schema)

    try:
        return _convert_record_fn(record_fn, _convert_aux_data_record, _validate_aux_data_record)
    except Exception as exc:
        logging.debug(str(exc))
        raise ValueError(f"(convert_aux_data_record_fn) Could not convert record file {record_fn}") from exc


if __name__ == '__main__':

    import os
    import sys
    import argparse

    parser = argparse.ArgumentParser(description='Sealog Record Importer')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('type', metavar='type',
                        choices=['cruise', 'lowering', 'event', 'aux_data'],
                        help='type of records contained in file (cruise, lowering, event, aux_data)')
    parser.add_argument('record_file', help=' records file to import')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    if not os.path.isfile(parsed_args.record_file):
        logging.error("%s does not exist.", parsed_args.record_file)
        sys.exit(os.EX_DATAERR)

    try:
        if parsed_args.type == "cruise":
            print(json.dumps(convert_cruise_record_fn(parsed_args.record_file)))

        elif parsed_args.type == "lowering":
            print(json.dumps(convert_lowering_record_fn(parsed_args.record_file)))

        elif parsed_args.type == "event":
            print(json.dumps(convert_event_record_rn(parsed_args.record_file)))

        elif parsed_args.type == "aux_data":
            print(json.dumps(convert_aux_data_record_fn(parsed_args.record_file)))

        else:
            print("invalid type option")
    except ValueError as exc:
        logging.error(str(exc))
        sys.exit(1)
