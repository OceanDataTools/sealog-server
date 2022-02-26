#!/usr/bin/env python3
# still in development
#

import asyncio
import json
import websockets
import requests


eventsAPIPath = '/api/v1/events'

localServerIP = '0.0.0.0'
localServerAPIPort = '8000'
localServerWSPort = '8000'
localServerPath = '/sealog-server'
#devel
localToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1MDEyNzY4fQ.Smk_qqn4ixjjahh365a1XxhdbmQdDjwpgwcey_ow_T4"
#prod
#localToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVhZTQ0ZGUwNjczMTI2MDY2NDZlZmJkYyIsInNjb3BlIjpbImFkbWluIl0sImlhdCI6MTUyNDkxMTY0MH0.3q0Wg_kKRkThzW5JFNhbBImn7LGk4TFT40lwl-CZ4_8"
localClientWSID = 'localSealogReceive'

remoteServerIP = '162.243.201.175'
remoteServerAPIPort = '80'
remoteServerWSPort = '80'
remoteServerPath = '/sealog-server'
remoteToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1MDE5Mzk3fQ.Sxk1GJ2qYmxFxfJsKr8NC5-WFfvN22FXPqZaoXPK_1o"
remoteClientWSID = 'remoteSealogReceive'

hello = {
    'type': 'hello',
    'id': localClientWSID,
    'auth': {
        'headers': {
            'authorization': localToken
        }
    },
    'version': '2',
    'subs': ['/ws/status/newEvents']
}

ping = {
    'type':'ping',
    'id':localClientWSID
}

localHeaders = {'authorization': localToken}
remoteHeaders = {'authorization': remoteToken}

async def eventlog():
    try:
        async with websockets.connect('ws://' + localServerIP + ':' + localServerWSPort) as websocket:

            await websocket.send(json.dumps(hello))

            while True:

                event = await websocket.recv()
                event_obj = json.loads(event)
                print("event_obj: %s", event_obj)

                if event_obj['type'] and event_obj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif event_obj['type'] and event_obj['type'] == 'pub':

                    req = requests.post('http://' + remoteServerIP + ':' + remoteServerAPIPort + remoteServerPath + eventsAPIPath, headers=remoteHeaders, data = json.dumps(event_obj['message']))
                    print(req.text)

                    ### end of repeat

    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
