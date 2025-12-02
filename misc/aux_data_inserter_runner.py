#!/usr/bin/env python3
'''
FILE:           sealog_aux_data_inserter_runner.py

DESCRIPTION:    Shared runner for aux-data inserter scripts.
'''
import re
import sys
import json
import time
import logging
import asyncio
import websockets
import yaml
from typing import Callable, Dict, Any

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.python_sealog.events import get_event, get_events_by_cruise, get_events_by_lowering
from misc.python_sealog.event_aux_data import create_event_aux_data
from misc.python_sealog.lowerings import get_lowering_uid_by_id
from misc.python_sealog.cruises import get_cruise_uid_by_id

EXCLUDE_SET = set() #TODO: not sure what you would want to put here. Should this on the individual inserters instead?

def parse_event_ids(event_id_file):
    '''
    Builds list of event uid from csv-formatted file.
    '''
    event_ids_from_file = []
    with open(event_id_file, 'r', encoding='utf-8') as event_id_fp:
        for line in event_id_fp:
            line = line.rstrip('\n')
            logging.debug(line)
            event_ids_from_file += line.split(',')

        event_ids_from_file = [event_id.strip() for event_id in event_ids_from_file]

        for event_id in event_ids_from_file:
            if re.match(r"^[a-f\d]{24}$", event_id) is None:
                logging.error("\"%s\" is an invalid event_id... quiting", event_id)
                raise ValueError(f'"{event_id}" is an invalid event_id... quiting')

    return event_ids_from_file


def insert_aux_data(aux_data_builders, event, dry_run=False):
    '''
    Add aux_data records for only the specified event
    '''
    for builder in aux_data_builders:
        logging.debug("Building aux data record")
        record = builder.build_aux_data_record(event)
        if record:
            try:
                logging.debug("Submitting aux data record to Sealog Server")
                logging.debug(json.dumps(record))
                if not dry_run:
                    create_event_aux_data(record)

            except Exception as exc:  # pylint:disable=W0718
                logging.warning("Error submitting aux data record")
                logging.debug(str(exc))
        else:
            logging.debug("No aux data for data_source: %s", builder.data_source)


def insert_aux_data_from_list(aux_data_builders, event_ids_from_list, dry_run=False):
    '''
    Add aux_data records for only the events in the specified list
    '''
    for event_id in event_ids_from_list:
        try:
            logging.debug("Retrieving event record from Sealog Server")
            event = get_event(event_id)
            logging.debug("Event: %s", event)

        except Exception as exc:
            logging.warning("Error submitting aux data record")
            logging.debug(str(exc))
            raise exc

        insert_aux_data(aux_data_builders, event, dry_run)


def insert_aux_data_for_cruise(aux_data_builders, cruise_id, dry_run=False):
    '''
    Add aux_data records for only the events in the specified cruise
    '''
    cruise_uid = get_cruise_uid_by_id(cruise_id)

    # exit if no cruise found
    if not cruise_uid:
        logging.error("cruise not found")
        return

    # retrieve events for cruise
    cruise_events = get_events_by_cruise(cruise_uid)

    # exit if no cruise found
    if not cruise_events:
        logging.error("no events found for cruise")
        return

    for event in cruise_events:
        insert_aux_data(aux_data_builders, event, dry_run)


def insert_aux_data_for_lowering(aux_data_builders, lowering_id, dry_run=False):
    '''
    Add aux_data records for only the events in the specified lowering
    '''
    lowering_uid = get_lowering_uid_by_id(lowering_id)

    # exit if no lowering found
    if not lowering_uid:
        logging.error("lowering not found")
        return

    # retrieve events for lowering
    lowering_events = get_events_by_lowering(lowering_uid)

    # exit if no lowering found
    if not lowering_events:
        logging.error("no events found for lowering")
        return

    for event in lowering_events:
        insert_aux_data(aux_data_builders, event, dry_run)

async def insert_aux_data_from_ws(aux_data_builders, ws_server_url, headers, client_wsid, dry_run=False):
    '''
    Use the aux_data_builder and to submit aux_data
    records built from external data to the sealog-server API
    '''
    async with websockets.connect(ws_server_url) as websocket:

        HELLO = {
            'type': 'hello',
            'id': client_wsid,
            'auth': {'headers': headers},
            'version': '2',
            'subs': ['/ws/status/newEvents']
        }
        await websocket.send(json.dumps(HELLO))

        # Precompute PING JSON to avoid reconstructing on every ping
        PING = json.dumps({'type': 'ping', 'id': client_wsid})

        while True:
            event = await websocket.recv()
            event_obj = json.loads(event)
            event_type = event_obj.get('type')

            if event_type:
                if event_type == 'ping':
                    await websocket.send(PING)

                elif event_type == 'pub':
                    message = event_obj.get('message')
                    if message.get('event_value') in EXCLUDE_SET:
                        logging.debug("Skipping because event value is in the exclude set")
                    else:
                        logging.debug("Event: %s", message)
                        insert_aux_data(aux_data_builders, message, dry_run)
            else:
                logging.warning("Malformed event received")
    
def run_aux_data_inserter(
    builder_factory: Callable[[Dict[str, Any]], AuxDataRecordBuilder],
    inline_config: str,
    ws_server_url: str,
    headers: Dict[str, Any],
    client_wsid: str,
):
    """
    Shared CLI and main loop.

    builder_factory: callable(config_dict) -> builder instance
    inline_config: YAML string used if -f not provided
    ws_server_url, headers, client_wsid: for websocket connection.
    """
    import argparse
    import os

    parser = argparse.ArgumentParser(description='Aux Data Inserter Service (shared)')
    parser.add_argument('-v', '--verbosity', dest='verbosity', default=0, action='count', help='Increase output verbosity')
    parser.add_argument('-f', '--config_file', help='use the specifed configuration file')
    parser.add_argument('-n', '--dry_run', action='store_true', help='compile the aux_data records but do not submit to server API')
    parser.add_argument('-e', '--events', help='list of event_ids to apply aux data')
    parser.add_argument('-c', '--cruise_id', help='cruise_id to fix aux_data for')
    parser.add_argument('-l', '--lowering_id', help='lowering_id to fix aux_data for')

    parsed_args = parser.parse_args()

    # Logging setup
    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)
    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    if parsed_args.config_file:
        config_file, data_source = (
            parsed_args.config_file.split(":")
            if ":" in parsed_args.config_file
            else [parsed_args.config_file, None]
        )

        try:
            with open(config_file, 'r', encoding='utf-8') as config_fp:
                aux_data_configs = yaml.safe_load(config_fp)
            if data_source:
                aux_data_configs = [c for c in aux_data_configs if c['data_source'] == data_source]
        except yaml.parser.ParserError:
            logging.error("Invalid YAML syntax")
            sys.exit(1)
    else:
        try:
            aux_data_configs = yaml.safe_load(inline_config)
        except yaml.parser.ParserError:
            logging.error("Invalid YAML syntax")
            sys.exit(1)

    logging.debug(json.dumps(aux_data_configs, indent=2))

    # Build builders
    aux_data_builder_list = [builder_factory(cfg) for cfg in aux_data_configs]

    # Dispatch actions requested on CLI
    if parsed_args.events:
        event_ids = parse_event_ids(parsed_args.events)
        logging.info("Event IDs:\n%s", json.dumps(event_ids, indent=2))
        insert_aux_data_from_list(aux_data_builder_list, event_ids, parsed_args.dry_run)
        sys.exit(0)

    if parsed_args.cruise_id:
        insert_aux_data_for_cruise(aux_data_builder_list, parsed_args.cruise_id, parsed_args.dry_run)
        sys.exit(0)

    if parsed_args.lowering_id:
        insert_aux_data_for_lowering(aux_data_builder_list, parsed_args.lowering_id, parsed_args.dry_run)
        sys.exit(0)

    # Wait then start WS loop forever. Sleep and retry on any disconnect/error
    while True:
        time.sleep(5)
        try:
            logging.debug("Connecting to event websocket feed...")
            asyncio.get_event_loop().run_until_complete(
                insert_aux_data_from_ws(aux_data_builder_list, ws_server_url, headers, client_wsid, parsed_args.dry_run)
            )
        except KeyboardInterrupt:
            logging.error('Keyboard Interrupted')
            try:
                sys.exit(0)
            except SystemExit:
                os._exit(0)  # pylint: disable=protected-access
        except Exception as err:  # pylint: disable=W0718
            logging.debug(str(err))
            logging.error("Lost connection to server, trying again in 5 seconds")