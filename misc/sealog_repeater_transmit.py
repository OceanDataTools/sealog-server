#!/usr/bin/env python3
'''
FILE:           sealog_repeater_transmit.py

DESCRIPTION:    This script listens for new events and event updates and
                transmits those new/updated records to a remote sealog
                instance

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-04-21
REVISION:   2022-02-27

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import sys
import asyncio
import json
import websockets
import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import WS_SERVER_URL, HEADERS, EVENTS_API_PATH

CLIENT_WSID = 'cruiseSync'

HELLO = {
    'type': 'hello',
    'id': CLIENT_WSID,
    'auth': {
        'headers': HEADERS
    },
    'version': '2',
    'subs': ['/ws/status/newEvents', '/ws/status/updateEvents']
}

PING = {
    'type':'ping',
    'id':CLIENT_WSID
}

SEALOG_SERVER_INSTANCES = [
    {
        'apiServerURL': '',
        'token':''
    }
]

async def transmit_event(event):
    '''
    Repeat the event to the remote server(s).
    '''

    for instance in SEALOG_SERVER_INSTANCES:
        # check to see if a cruise record with the cruiseID in cruise_record already exists

        instance_headers = {
            "authorization": instance['token']
        }

        url = instance['apiServerURL'] + EVENTS_API_PATH
        logging.debug(url)
        logging.debug(json.dumps(event))

        try:
            req = requests.post(url, headers=instance_headers, data=json.dumps(event))
            logging.debug(req.text)

        except Exception as error:
            logging.error('Error adding event to remote server')
            logging.debug(str(error))
            raise error

async def repeater()
    '''
    Main loop of the repeater process.
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

                    await transmit_event(event_obj['message'])

                else:
                    logging.debug("Skipping because lowering value is in the exclude set")

    except Exception as err:
        logging.error(str(err))


asyncio.get_event_loop().run_until_complete(repeater())
