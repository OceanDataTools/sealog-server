#!/usr/bin/env python3

import asyncio
import websockets
import json

serverIP = '162.243.201.175'
serverWSPort = '8001'

async def eventlog():
    async with websockets.connect('ws://' + serverIP + ':' + serverWSPort) as websocket:

        hello = {
            'type': 'hello',
            'id': 'abcdefg',
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
