#!/usr/bin/env python3
#
# Purpose: This service listens for new events submitted to Sealog
#          and performs additional actions depending on the recieved
#          event.
#
#          Currently this service listens for "On Bottom" and "Off
#          Bottom" events and enables/disables the ASNAP functionality.
#
#   Usage: Type python3 sealog-autoActions.py to start the service.
#
#          This serivce runs in the forground. Type ^d to kill the
#          service.
#
#  Author: Webb Pinner webbpinner@gmail.com
# Created: 2018-09-26

import asyncio
import websockets
import json
import requests
import logging
from pymongo import MongoClient

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
customVarAPIPath = '/api/v1/custom_vars'

asnapStatusVarName = 'asnapStatus'
asnapStatusVarID = '59810167212b348aed7fa9f5'

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYzlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI2Njg4MjAyfQ.tL6Vn9jcET9YfdcGHEnMdLGa2XAcd7bg8UVVkP58qck"
token_prod = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTM3MDYyOTc1fQ.mQiInLfCVv_jkyqna8qx6igCpiVz5b6ycE16a2S3RmQ"
token = token_prod

includeSet = ('VEHICLE')

clientWSID = 'autoActions'

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
    try:
        async with websockets.connect('ws://' + serverIP + ':' + serverWSPort) as websocket:

            await websocket.send(json.dumps(hello))

            while(True):

                event = await websocket.recv()
                eventObj = json.loads(event)

                if eventObj['type'] and eventObj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif eventObj['type'] and eventObj['type'] == 'pub':
                    if eventObj['message']['event_value'] in includeSet:

                        logger.debug("Event:\n" + json.dumps(eventObj['message'], indent=2))

                        for option in eventObj['message']['event_options']:
                            if option['event_option_name'] == "Milestone" and option['event_option_value'] == "On bottom":
                                logger.debug("Turn on ASNAP")
                                payload = { "custom_var_value": "On"}
                                r = requests.patch('http://' + serverIP + ':' + serverAPIPort + serverPath + customVarAPIPath + '/' + asnapStatusVarID, headers=headers, data = json.dumps(payload))
                            elif option['event_option_name'] == "Milestone" and option['event_option_value'] == "Off bottom":
                                logger.debug("Turn off ASNAP")
                                payload = { "custom_var_value": "Off"}
                                r = requests.patch('http://' + serverIP + ':' + serverAPIPort + serverPath + customVarAPIPath + '/' + asnapStatusVarID, headers=headers, data = json.dumps(payload))

                        # record = collection.find_one({'label':'ODR'})
                        
                        # auxData = auxDataTemplate

                        # auxData['event_id'] = eventObj['message']['id']
                        # auxData['data_source'] = "alvinRealtimeNavData"
                        # auxData['data_array'] = []

                        # auxData['data_array'].append({ 'data_name': "latitude",'data_value': record['data']['latitude'], 'data_uom': 'ddeg' })
                        # auxData['data_array'].append({ 'data_name': "longitude",'data_value': record['data']['longitude'], 'data_uom': 'ddeg' })
                        # auxData['data_array'].append({ 'data_name': "alvin_x",'data_value': record['data']['alvin_x'], 'data_uom': 'meters' })
                        # auxData['data_array'].append({ 'data_name': "alvin_y",'data_value': record['data']['alvin_y'], 'data_uom': 'meters' })
                        # auxData['data_array'].append({ 'data_name': "depth",'data_value': record['data']['depth'], 'data_uom': 'meters' })
                        # auxData['data_array'].append({ 'data_name': "heading",'data_value': record['data']['heading'], 'data_uom': 'deg' })
                        # auxData['data_array'].append({ 'data_name': "pitch",'data_value': record['data']['pitch'], 'data_uom': 'deg' })
                        # auxData['data_array'].append({ 'data_name': "roll",'data_value': record['data']['roll'], 'data_uom': 'deg' })
                        # auxData['data_array'].append({ 'data_name': "altitude",'data_value': record['data']['altitude'], 'data_uom': 'meters' })

                        # logger.debug("Adding Record: " + json.dumps(auxData))

                        # r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + auxDataAPIPath, headers=headers, data = json.dumps(auxData))
                        # logger.debug("Response: " + r.text)

                    ### end of repeat
                else:
                    logger.debug("Skipping because event value is not in the include set")

    except Exception as error:
        logging.error(str(error))

asyncio.get_event_loop().run_until_complete(eventlog())
