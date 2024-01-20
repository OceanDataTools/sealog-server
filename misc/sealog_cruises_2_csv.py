#!/usr/bin/env python3
'''
FILE:           sealog_cruises_2_csv.py

DESCRIPTION:    Output the sealog cruise records to file in csv format.
                Optionally run as a service that listens for new and updated
                cruise records and updates the csv file as needed.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-04-22
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

import sys
import json
import logging
import asyncio
import websockets

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.cruises import get_cruises
from misc.python_sealog.settings import WS_SERVER_URL, HEADERS

CLIENT_WSID = 'cruise2CSVSync'

HELLO = {
    'type': 'hello',
    'id': CLIENT_WSID,
    'auth': {
        'headers': HEADERS
    },
    'version': '2',
    'subs': ['/ws/status/newCruises', '/ws/status/updateCruises']
}

PING = {
    'type':'ping',
    'id':CLIENT_WSID
}

def update_csv_file(output_file):
    '''
    Update the csv output_file with the latest cruise record data.
    '''

    logging.info("Retrieving cruise records")
    cruises = get_cruises(export_format='csv')
    logging.debug("cruises\n%s", cruises)

    logging.info("Updating cruise csv file")

    try:
        with open( output_file, 'w' ) as file :
            file.write(cruises)
    except Exception as error:
        logging.error('Could not create output file: %s', output_file)
        logging.error(error)

    logging.info("Done")


async def cruise_sync(output_file):
    '''
    Listen to the newCruise and updateCruise subscriptions and call
    update_csv_file whenever there is a change.
    '''

    try:
        async with websockets.connect(WS_SERVER_URL) as websocket:

            await websocket.send(json.dumps(HELLO))

            while True:

                cruise = await websocket.recv()
                cruise_obj = json.loads(cruise)

                if cruise_obj['type'] and cruise_obj['type'] == 'ping':

                    await websocket.send(json.dumps(PING))

                elif cruise_obj['type'] and cruise_obj['type'] == 'pub':

                    logging.info("A cruise record has been added or an existing record has been updated")
                    logging.debug(json.dumps(cruise_obj, indent=2))
                    update_csv_file(output_file)

                else:
                    logging.debug("Skipping because message is not important")

    except Exception as error:
        logging.error(str(error))


# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == "__main__":

    import argparse
    import os

    parser = argparse.ArgumentParser(description='Converts sealog cruise records to csv format.')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                                            default=0, action='count',
                                            help='Increase output verbosity')
    parser.add_argument('-s', '--service', action='store_true', help='run as service that listens to changes to sealog cruise records.')
    parser.add_argument('output_file', help='The filepath to save the cruises to.')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    try:
        # Update the file immediately
        update_csv_file(parsed_args.output_file)

        # If requested start the service to update the output_file whenever a
        # cruise record is created or changed.
        if parsed_args.service:
            asyncio.get_event_loop().run_until_complete(cruise_sync(parsed_args.output_file))

    except KeyboardInterrupt:
        logging.warning('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0) # pylint: disable=protected-access
