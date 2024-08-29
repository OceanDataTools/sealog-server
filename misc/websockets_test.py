#!/usr/bin/env python3
'''
FILE:           websocket_test.py

DESCRIPTION:    Simple script to demonstrate how to subscribe to the new event
                websocket feed.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2018-06-27
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

import sys
import asyncio
import json
import logging
import websockets

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import WS_SERVER_URL, HEADERS

CLIENT_WS_ID = 'websocketTest'

HELLO = {
    'type': 'hello',
    'id': CLIENT_WS_ID,
    'auth': {
        'headers': HEADERS
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

PING = {
    'type':'ping',
    'id':CLIENT_WS_ID
}

async def websocket_test():
    '''
    Connects to the sealog-server and subscribes to the newEvent feed
    '''

    try:
        async with websockets.connect(WS_SERVER_URL) as websocket:

            await websocket.send(json.dumps(HELLO))

            while True:

                event = await websocket.recv()
                event_obj = json.loads(event)

                if event_obj['type'] and event_obj['type'] == 'ping':
                    await websocket.send(json.dumps(PING))

                elif event_obj['type'] and event_obj['type'] == 'pub':
                    logging.info("New Event: %s", json.dumps(event_obj['message']))

    except Exception as exc:
        logging.error(str(exc))

# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == '__main__':

    import argparse
    import os

    parser = argparse.ArgumentParser(description='Simple script to demonstrate how to subscribe to the new event websocket feed')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=1, action='count',
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

    try:
        asyncio.get_event_loop().run_until_complete(websocket_test())
    except KeyboardInterrupt:
        logging.warning('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0) # pylint: disable=protected-access
