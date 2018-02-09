#!/usr/bin/env python3

import asyncio
import websockets
import json
import requests

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
auxDataAPIPath = '/api/v1/event_aux_data'

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3ODM5NjYyfQ.YCLG0TcDUuLtaYVgnfxC7R-y3kWZcZGtyMcvI2xYFYA"

hello = {
    'type': 'hello',
    'id': 'abcdefg',
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
    'id':'abcdefg'
}

headers = {'authorization': token}

auxDataTemplate = {
    'event_id': None,
    'data_source': None,
    'data_array': []
}

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
                    
                    ### repeat for multiple cameras

                    camera_name = "Camera 2"

                    # code to take framegrab, save framegrab, returns full path to framegrab
                    filename = "/data/camera2/camera_2_image.png"

                    auxData = auxDataTemplate

                    auxData['event_id'] = eventObj['message']['id']
                    auxData['data_source'] = "framegrabber"

                    auxData['data_array'].append({ 'data_name': "camera_name",'data_value': camera_name })
                    auxData['data_array'].append({ 'data_name': "filename",'data_value': filename })

                    # print(json.dumps(auxData, indent=2))

                    r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + auxDataAPIPath, headers=headers, data = json.dumps(auxData))
                    print(r.text)

                    ### end of repeat

    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
