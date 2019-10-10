#!/usr/bin/env python3
# Little test script that can be used as a boilerplate for writing new 
# services that listen to the real-time event feed

import asyncio
import websockets
import json
import logging

import python_sealog
from python_sealog.settings import wsServerURL, headers

LOG_LEVEL = logging.INFO

# create logger
logger = logging.getLogger(__file__ )
logger.setLevel(LOG_LEVEL)

# create console handler and set level to debug
ch = logging.StreamHandler()
ch.setLevel(LOG_LEVEL)

# create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

clientWSID = 'websocketTest'

hello = {
    'type': 'hello',
    'id': clientWSID,
    'auth': {
        'headers': headers
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

ping = {
    'type':'ping',
    'id':clientWSID
}

async def websocketTest():
    try:
        async with websockets.connect(wsServerURL) as websocket:

            await websocket.send(json.dumps(hello))

            while(1):

                event = await websocket.recv()
                eventObj = json.loads(event)

                if eventObj['type'] and eventObj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif eventObj['type'] and eventObj['type'] == 'pub':
                    logger.info("New Event: " + json.dumps(eventObj['message']))
    except Exception as error:
        logger.error(str(error))

if __name__ == '__main__':

  import os
  import sys

try:
    asyncio.get_event_loop().run_until_complete(websocketTest())
except KeyboardInterrupt:
    print('Interrupted')
    try:
        sys.exit(0)
    except SystemExit:
        os._exit(0)
