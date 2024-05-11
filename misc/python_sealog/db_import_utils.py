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
                "cruise_participants": { "type": "array" },
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


def _convertRecord(record):

    try:
        new_record = copy.deepcopy(record)
        new_record['_id'] = { "$oid": record['id'] }
        del new_record['id']
        return new_record

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertRecord) Could not convert record {record['id']}")


def _validateRecord(record, record_schema):

    try:
        validate(instance=record, schema=record_schema)

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_validateRecord) Could not validate record {record['id']}")


def _convertCruiseRecord(record):

    try:
        new_record = _convertRecord(record)
        new_record['start_ts'] = { "$date": new_record['start_ts']}
        new_record['stop_ts'] = { "$date": new_record['stop_ts']}

        return new_record    

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertCruiseRecord) Could not convert record {record['id']}")


def _convertLoweringRecord(record):

    try:
        new_record = _convertRecord(record)
        new_record['start_ts'] = { "$date": new_record['start_ts']}
        new_record['stop_ts'] = { "$date": new_record['stop_ts']}

        return new_record    

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertLoweringRecord) Could not convert record {record['id']}")


def _convertEventRecord(record):

    try:
        new_record = _convertRecord(record)
        new_record['ts'] = {"$date": new_record['ts']}

        return new_record    

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertEventRecord) Could not convert record {record['id']}")


def _convertAuxDataRecord(record):

    try:
        new_record = _convertRecord(record)
        new_record['event_id'] = { "$oid": new_record['event_id'] }

        return new_record    

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertAuxDataRecord) Could not convert record {record['id']}")


def _convertRecordFN(record_fn, conv_func, validate_func):

    try:
        with open(record_fn) as record_fp:
            record = json.load(record_fp)

            if isinstance(record, dict):
                record = [record]

            logging.info("Validating record(s)")
            list(map(validate_func, record))

            logging.info("Converting record(s)")
            return list(map(conv_func, record))

    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(_convertRecordFN) Could not convert record {record['id']}")

# --------------------------------------------------------------------------- #
def convertCruiseRecordFN(record_fn):

    def _validateCruiseRecord(record):
        _validateRecord(record, cruise_schema) 

    try:
        return _convertRecordFN(record_fn, _convertCruiseRecord, _validateCruiseRecord )
    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(convertCruiseRecordFN) Could not convert record file {record_fn}")


def convertLoweringRecordFN(record_fn):

    def _validateLoweringRecord(record):
        _validateRecord(record, lowering_schema) 

    try:
        return _convertRecordFN(record_fn, _convertLoweringRecord, _validateLoweringRecord )
    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(convertLoweringRecordFN) Could not convert record file {record_fn}")


def convertEventRecordFN(record_fn):

    def _validateEventRecord(record):
        _validateRecord(record, event_schema) 

    try:
        return _convertRecordFN(record_fn, _convertEventRecord, _validateEventRecord )
    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(convertEventRecordFN) Could not convert record file {record_fn}")


def convertAuxDataRecordFN(record_fn):

    def _validateAuxDataRecord(record):
        _validateRecord(record, auxData_schema) 

    try:
        return _convertRecordFN(record_fn, _convertAuxDataRecord, _validateAuxDataRecord )
    except Exception as error:
        logging.debug(str(error))
        raise ValueError(f"(convertAuxDataRecordFN) Could not convert record file {record_fn}")


if __name__ == '__main__':

    import os
    import sys
    import argparse

    parser = argparse.ArgumentParser(description='Sealog Record Importer')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('type', metavar='type', choices=['cruise', 'lowering', 'event', 'aux_data'], help='type of records contained in file (cruise, lowering, event, aux_data)')
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
        logging.error(parsed_args.record_file + " does not exist.")
        sys.exit(os.EX_DATAERR)

    try:
        if parsed_args.type == "cruise":
            print(json.dumps(convertCruiseRecordFN(parsed_args.record_file)))

        elif parsed_args.type == "lowering":
            print(json.dumps(convertLoweringRecordFN(parsed_args.record_file)))

        elif parsed_args.type == "event":
            print(json.dumps(convertEventRecordFN(parsed_args.record_file)))

        elif parsed_args.type == "aux_data":
            print(json.dumps(convertAuxDataRecordFN(parsed_args.record_file)))
        else:
            print("invalid type option")
    except:
        sys.exit(1)
