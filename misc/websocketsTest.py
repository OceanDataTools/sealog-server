#!/usr/bin/env python3

import asyncio
import websockets
import json

serverIP = '0.0.0.0'
serverWSPort = '8001'
serverPath = ''

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

async def eventlog():
    try:
        async with websockets.connect('ws://' + serverIP + ':' + serverWSPort + serverPath) as websocket:

            await websocket.send(json.dumps(hello))

            while(1):

                event = await websocket.recv()
                eventObj = json.loads(event)

                if eventObj['type'] and eventObj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif eventObj['type'] and eventObj['type'] == 'pub':
                    print(json.dumps(eventObj['message']))
    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
