#!/usr/bin/env python3

import asyncio
import websockets
import json

serverIP = '127.0.0.1'
serverWSPort = '8001'
serverPath = ''

token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBhNDRjZTFhLTJjYjktMTFlNi1iNjdiLTllNzExMjhjYWU3NyIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTAwMjEwMDkyfQ.YJHgoOT1trlduZ70pGAoNlmsLpvN1o8HNhoXfWYniYM'

async def eventlog():
    async with websockets.connect('ws://' + serverIP + ':' + serverWSPort + serverPath) as websocket:

        hello = {
            'type': 'hello',
            'id': 'abcdefg',
            'auth': {
                'headers': {
                    'authorization': token
                }
            },
            'version': '2',
            'subs': ['/chat/updates']
        }

        ping = {
            'type':'ping',
            'id':'abcdefg'
        }

        await websocket.send(json.dumps(hello))

        while(1):

            event = await websocket.recv()
            eventObj = json.loads(event)

            if eventObj['type'] and eventObj['type'] == 'ping':
                await websocket.send(json.dumps(ping))
            elif eventObj['type'] and eventObj['type'] == 'pub':
                print(json.dumps(eventObj['message']))

asyncio.get_event_loop().run_until_complete(eventlog())
