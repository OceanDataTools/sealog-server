#!/usr/bin/env python3
# still in development
#

import asyncio
import websockets
import json
import requests


eventsAPIPath = '/api/v1/events'

localServerIP = '0.0.0.0'
localServerAPIPort = '8000'
localServerWSPort = '8001'
localServerPath = '/sealog-server'
localToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1MDE0NDE3fQ.D8ja66bnLxJ3bsJlaKRtOquu8XbibjNCyFxJpI7vafc'
localClientWSID = 'localSealogReceive'

remoteServerIP = '162.243.201.175'
remoteServerAPIPort = '80'
remoteServerWSPort = '8001'
remoteServerPath = '/sealog-server'
remoteToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1MDEzNTUxfQ.8X-fBRUHdrwtkTLcOFAsW-vvvqCzmkZKM2gQgHNkBKk"
remoteClientWSID = 'remoteSealogReceive'

hello = {
    'type': 'hello',
    'id': remoteClientWSID,
    'auth': {
        'headers': {
            'authorization': remoteToken
        }
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

ping = {
    'type':'ping',
    'id':remoteClientWSID
}

localHeaders = {'authorization': localToken}
remoteHeaders = {'authorization': remoteToken}

async def eventlog():
    try:
        async with websockets.connect('ws://' + remoteServerIP + ':' + remoteServerWSPort) as websocket:

            await websocket.send(json.dumps(hello))

            while(True):

                event = await websocket.recv()
                eventObj = json.loads(event)
                print("eventObj:", eventObj)

                if eventObj['type'] and eventObj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif eventObj['type'] and eventObj['type'] == 'pub':

                    r = requests.post('http://' + localServerIP + ':' + localServerAPIPort + localServerPath + eventsAPIPath, headers=localHeaders, data = json.dumps(eventObj['message']))
                    print(r.text)

                    ### end of repeat

    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
