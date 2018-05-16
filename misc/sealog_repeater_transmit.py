#!/usr/bin/env python3

import asyncio
import websockets
import json
import requests


eventsAPIPath = '/api/v1/events'

localServerIP = '0.0.0.0'
localServerAPIPort = '8000'
localServerWSPort = '8001'
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

            while(True):

                event = await websocket.recv()
                eventObj = json.loads(event)
                print("eventObj:", eventObj)

                if eventObj['type'] and eventObj['type'] == 'ping':
                    await websocket.send(json.dumps(ping))
                elif eventObj['type'] and eventObj['type'] == 'pub':

                    r = requests.post('http://' + remoteServerIP + ':' + remoteServerAPIPort + remoteServerPath + eventsAPIPath, headers=remoteHeaders, data = json.dumps(eventObj['message']))
                    print(r.text)

                    ### end of repeat

    except Exception as error:
        print(error)

asyncio.get_event_loop().run_until_complete(eventlog())
