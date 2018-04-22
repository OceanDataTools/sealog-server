#!/usr/bin/env python3

import asyncio
import websockets
import json
import requests
from urllib.request import urlretrieve

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
auxDataAPIPath = '/api/v1/event_aux_data'

framegrabberAPIPath = '/cgi-bin/snapshot.cgi?force=1'

destDir = '/home/alvin/framegrabs'

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3ODM5NjYyfQ.YCLG0TcDUuLtaYVgnfxC7R-y3kWZcZGtyMcvI2xYFYA"
token_prod =  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI0MTc4NTE4fQ.DGy2i2lyBbCyuao56YZqP0w5moJEROqQQeVVI6rRDgQ"

token = token_devel

hello = {
    'type': 'hello',
    'id': 'framegrabber',
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
    'id':'framegrabber'
}

headers = {'authorization': token}

auxDataTemplate = {
    'event_id': None,
    'data_source': None,
    'data_array': []
}

cameras = [
    {
        'name': "Camera 1",
        'ip': "199.92.162.127",
        'prefix': "cam01_",
        'suffix': ".jpg"

    },
    {
        'name': "Camera 2",
        'ip': "199.92.162.127",
        'prefix': "cam02_",
        'suffix': ".jpg"

    },
    {
        'name': "Camera 3",
        'ip': "199.92.162.127",
        'prefix': "cam03_",
        'suffix': ".jpg"

    }
]

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
                    
                    auxData = {
                        'event_id': None,
                        'data_source': None,
                        'data_array': []
                    }
                    auxData['event_id'] = eventObj['message']['id']
                    auxData['data_source'] = "framegrabber"

                    ### repeat for multiple cameras
                    for camera in cameras:

                        print("camera:", camera)

                        url = 'http://' + camera['ip'] + framegrabberAPIPath
                        dst = destDir + '/' + camera['prefix'] + eventObj['message']['id'] + camera['suffix']
                        print("url:", url)
                        print("dst:", dst)
                        urlretrieve(url, dst)

                        auxData['data_array'].append({ 'data_name': "camera_name",'data_value': camera['name'] })
                        auxData['data_array'].append({ 'data_name': "filename",'data_value': dst })

                        # print(json.dumps(auxData, indent=2))
                        ### end of repeat

                    r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + auxDataAPIPath, headers=headers, data = json.dumps(auxData))
                    print(r.text)
                
    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
