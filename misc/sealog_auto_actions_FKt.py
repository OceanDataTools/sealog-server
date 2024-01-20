#!/usr/bin/env python3
'''
FILE:           sealog_aux_data_inserter.py

DESCRIPTION:    This service listens for new events submitted to Sealog, creates
                an aux_data record containing the specified real-time data and
                associates the aux data record with the newly created event.
                However if the realtime data is older than 20 seconds this service
                will consider the data stale and will not associate it with the
                newly created event.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2020-01-27
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import sys
import asyncio
import json
import time
import logging
from datetime import datetime, timedelta
import requests
import websockets
from pymongo import MongoClient

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import API_SERVER_URL, WS_SERVER_URL, EVENT_AUX_DATA_API_PATH, HEADERS

# Names of the appropriate mongoDB database and collection containing the desired real-time data.
DATABASE = 'sealog_udp_cache'
COLLECTION = 'udpData'

# Unique label of the record in the DATABASE.COLLECTION containing the desired real-time data
RECORD_LABEL = "testData"

# The data_source to use for the auxData records
AUX_DATA_DATASOURCE = 'realtimeTestData'

# time afterwhich realtime data is considered stale
THRESHOLD = 20 # seconds

# set of events to ignore
EXCLUDE_SET = ()


CLIENT_WSID = 'aux_data_inserter_' + AUX_DATA_DATASOURCE # needs to be unique for all currently active dataInserter scripts.

HELLO = {
    'type': 'hello',
    'id': CLIENT_WSID,
    'auth': {
        'headers': HEADERS
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

PING = {
    'type':'ping',
    'id':CLIENT_WSID
}


def aux_data_record_builder(event, record):
    '''
    Build the aux_data record using the new event and real-time data record
    '''

    if not record:
        return None

    aux_data_record = {
        'event_id': event['id'],
        'data_source': AUX_DATA_DATASOURCE,
        'data_array': []
    }

    for key, value in record['data'].items():
        aux_data_record['data_array'].append({ 'data_name': key,'data_value': value, 'data_uom': '??' })

    logging.debug("Aux Data Record:\n%s", json.dumps(aux_data_record, indent=2))

    if len(aux_data_record['data_array']) == 0:
        return None

    return aux_data_record


async def aux_data_inserter():
    '''
    Connect to the websocket feed for new events.  When new events arrive,
    build aux_data records and submit them to the sealog-server.
    '''

    try:

        # establish database connection
        client = MongoClient()
        collection = client[DATABASE][COLLECTION]

        async with websockets.connect(WS_SERVER_URL) as websocket:

            await websocket.send(json.dumps(HELLO))

            while True:

                event = await websocket.recv()
                event_obj = json.loads(event)

                if event_obj['type'] and event_obj['type'] == 'ping':
                    await websocket.send(json.dumps(PING))

                elif event_obj['type'] and event_obj['type'] == 'pub':

                    if event_obj['message']['event_value'] in EXCLUDE_SET:
                        logging.debug("Skipping because event value is in the exclude set")
                        continue

                    if datetime.strptime(event_obj['message']['ts'], '%Y-%m-%dT%H:%M:%S.%fZ') < datetime.utcnow()-timedelta(seconds=THRESHOLD):
                        logging.debug("Skipping because event ts is older than thresold")
                        continue

                    try:
                        record = collection.find_one({"label": RECORD_LABEL})

                        logging.debug("Record from database:\n%s", json.dumps(record['data'], indent=2))

                        if not record:
                            logging.error("No data record found in %s.%s with a label of %s", DATABASE, COLLECTION, RECORD_LABEL )
                            continue

                        if not 'updated' in record:
                            logging.error("Data record must contain and 'updated' field containing a datetime object of when the data was last updated")
                            continue

                        if record['updated'] < datetime.utcnow()-timedelta(seconds=THRESHOLD):
                            logging.debug("Data record is considered stale, skipping")
                            continue

                    except Exception as error:
                        logging.error("Error retrieving auxData record")
                        logging.debug(str(error))
                        continue

                    aux_data_record = aux_data_record_builder(event_obj['message'], record)

                    if not aux_data_record:
                        logging.debug("Skipping because there's no data to add")
                        continue

                    try:
                        logging.debug("Submitting AuxData record to Sealog Server")
                        req = requests.post(API_SERVER_URL + EVENT_AUX_DATA_API_PATH, headers=HEADERS, data = json.dumps(aux_data_record))
                        logging.debug("Response: %s", req.text)

                    except Exception as error:
                        logging.error("Error submitting auxData record")
                        logging.debug(str(error))
                        raise error

    except Exception as error:
        logging.error(str(error))
        raise error

# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == '__main__':

    import argparse
    import os

    parser = argparse.ArgumentParser(description='Aux Data Inserter Service - ' + AUX_DATA_DATASOURCE)
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    # Run the main loop
    while True:

        # Wait 5 seconds for the server to complete startup
        time.sleep(5)

        try:
            logging.debug("Connecting to event websocket feed...")
            asyncio.get_event_loop().run_until_complete(aux_data_inserter())
        except KeyboardInterrupt:
            logging.error('Keyboard Interrupted')
            try:
                sys.exit(0)
            except SystemExit:
                os._exit(0) # pylint: disable=protected-access
        except Exception as error:
            logging.error("Lost connection to server, trying again in 5 seconds")
            logging.debug(str(error))
