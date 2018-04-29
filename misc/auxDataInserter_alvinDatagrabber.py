#!/usr/bin/env python3
import asyncio
import websockets
import json
import requests
import logging
import time
import sys
import os
from pymongo import MongoClient

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
auxDataAPIPath = '/api/v1/event_aux_data'

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3ODM5NjYyfQ.YCLG0TcDUuLtaYVgnfxC7R-y3kWZcZGtyMcvI2xYFYA"
token_prod =  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVhZTQ0ZGUwNjczMTI2MDY2NDZlZmJkYyIsInNjb3BlIjpbImFkbWluIl0sImlhdCI6MTUyNDkxMTY0MH0.3q0Wg_kKRkThzW5JFNhbBImn7LGk4TFT40lwl-CZ4_8"

token = token_prod

clientWSID = 'alvinData'

hello = {
    'type': 'hello',
    'id': clientWSID,
    'auth': {
        'headers': {
            'authorization': token
        }
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

ping = {
    'type':'ping',
    'id':clientWSID
}

headers = {'authorization': token}

auxDataTemplate = {
    'event_id': None,
    'data_source': None,
    'data_array': []
}

client = MongoClient()
db = client.datagrabberDB
collection = db.datagrabberCOLL

LOG_LEVEL = logging.DEBUG

# Valid line headers to process
validLineLabels = ['CSV']

# create logger
logger = logging.getLogger(__file__ )
logger.setLevel(LOG_LEVEL)

# create console handler and set level to debug
ch = logging.StreamHandler()
ch.setLevel(LOG_LEVEL)

# create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

async def eventlog():
    """
    Attempts to connect to websocket, listen for the arrival of new events, 
    build auxData data objects for those events and insert those objects 
    into the Sealog via the Sealog API.
    """

    while(True):
        try:
            async with websockets.connect('ws://' + serverIP + ':' + serverWSPort) as websocket:

                await websocket.send(json.dumps(hello))

                while(True):

                    event = await websocket.recv()
                    eventObj = json.loads(event)

                    if eventObj['type'] and eventObj['type'] == 'ping':
                        await websocket.send(json.dumps(ping))
                    elif eventObj['type'] and eventObj['type'] == 'pub':

                        record = collection.find_one({'label':'CSV'})

                        auxData = auxDataTemplate

                        auxData['event_id'] = eventObj['message']['id']
                        auxData['data_source'] = "alvinRealtimeNavData"
                        auxData['data_array'] = []

                        auxData['data_array'].append({ 'data_name': "latitude",'data_value': record['data']['latitude'], 'data_uom': 'ddeg' })
                        auxData['data_array'].append({ 'data_name': "longitude",'data_value': record['data']['longitude'], 'data_uom': 'ddeg' })
                        auxData['data_array'].append({ 'data_name': "depth",'data_value': record['data']['depth'], 'data_uom': 'meters' })
                        auxData['data_array'].append({ 'data_name': "heading",'data_value': record['data']['heading'], 'data_uom': 'deg' })
                        auxData['data_array'].append({ 'data_name': "pitch",'data_value': record['data']['pitch'], 'data_uom': 'deg' })
                        auxData['data_array'].append({ 'data_name': "roll",'data_value': record['data']['roll'], 'data_uom': 'deg' })
                        auxData['data_array'].append({ 'data_name': "altitude",'data_value': record['data']['altitude'], 'data_uom': 'meters' })

                        logger.debug("Adding Record: " + json.dumps(auxData))

                        r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + auxDataAPIPath, headers=headers, data = json.dumps(auxData))
                        logger.debug("Response: " + r.text)

                        ### end of repeat

        except Exception as error:
            logging.error(str(error))

        time.sleep(10)

if __name__ == '__main__':

    """
    Main loop of script.  Attempts to connect to websocket, listen for the 
    arrival of new events, build auxData data objects for those events and 
    insert those objects into the Sealog via the Sealog API.
    """

    import argparse

    parser = argparse.ArgumentParser(description='Alvin Data auxData Inserter')
    parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')

    args = parser.parse_args()

    # Turn on debug mode
    if args.debug:
        logger.info("Setting log level to DEBUG")
        logging.getLogger().setLevel(logging.DEBUG)

    
        for handler in logger.handlers:
            handler.setLevel(logging.DEBUG)

    try:
        asyncio.get_event_loop().run_until_complete(eventlog())
    except KeyboardInterrupt:
        print('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)
