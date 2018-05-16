#!/usr/bin/env python3


import asyncio
import websockets
import json
import requests
import logging
import time
import sys
import os
from datetime import datetime

from urllib.request import urlretrieve

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
auxDataAPIPath = '/api/v1/event_aux_data'

framegrabberAPIPath = '/cgi-bin/snapshot.cgi?force=1'

destDir = '/home/alvin/framegrabs'

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1NDUxNTU4fQ.0fECi7gajFt9gCq--2edkURN36O2ryGbydUxudRAAiU"
token_prod = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1NjIyMTYwfQ.v05UDVHDUgnFfyhucPdfrTGaSJJSVxQTJ-pDnRJPPbo"

token = token_prod

clientWSID = 'alvinFramegrabber'

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
    'id': clientWSID
}

headers = {'authorization': token}

auxDataTemplate = {
    'event_id': None,
    'data_source': None,
    'data_array': []
}

framegrabbers = [
    {
        'name': "Framegrabber 1",
        'ip': "199.92.162.124",
        'prefix': "",
        'suffix': ".framegrab01.jpg"

    },
    {
        'name': "Framegrabber 2",
        'ip': "199.92.162.125",
        'prefix': "",
        'suffix': ".framegrab02.jpg"

    },
    {
        'name': "Framegrabber 3",
        'ip': "199.92.162.127",
        'prefix': "",
        'suffix': ".framegrab03.jpg"

    }
]

LOG_LEVEL = logging.ERROR

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
    while(True):
        try:
            logger.info("Connect to websockets: ws://" + serverIP + ":" + serverWSPort)
            async with websockets.connect('ws://' + serverIP + ':' + serverWSPort) as websocket:

                # logger.debug("Send Hello")
                await websocket.send(json.dumps(hello))
                event = await websocket.recv()
                eventObj = json.loads(event)
                if 'statusCode' in eventObj:
                    logger.error(event)

                while(True):

                    event = await websocket.recv()
                    eventObj = json.loads(event)
                    logger.debug("Event:" + event)

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

                        ### repeat for multiple framegrabbers
                        for framegrabber in framegrabbers:

                            #logger.debug("framegrabber:" + framegrabber)

                            filename_date = datetime.date(datetime.strptime(eventObj['message']['ts'], '%Y-%m-%dT%H:%M:%S.%fZ'))
                            filename_time = datetime.time(datetime.strptime(eventObj['message']['ts'], '%Y-%m-%dT%H:%M:%S.%fZ')) 
                            filename_middle = datetime.combine(filename_date, filename_time).strftime("%Y%m%d_%H%M%S%f")[:-3]

                            url = 'http://' + framegrabber['ip'] + framegrabberAPIPath
                            dst = destDir + '/' + framegrabber['prefix'] + filename_middle + framegrabber['suffix']
                            # logger.debug("url:" + url)
                            logger.debug("dst:" + dst)

                            try:
                                # urlretrieve(url, dst)
                                r = requests.get(url, timeout=.5)
                                with open(dst, 'wb') as f:
                                    f.write(r.content)

                                auxData['data_array'].append({ 'data_name': "camera_name",'data_value': framegrabber['name'] })
                                auxData['data_array'].append({ 'data_name': "filename",'data_value': dst })
                            except Exception as error:
                                logger.error("Unable to get image from framegrabber:" + framegrabber['ip'])

                            # print(json.dumps(auxData, indent=2))
                            ### end of repeat

                        if len(auxData['data_array']) > 0:
                            r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + auxDataAPIPath, headers=headers, data = json.dumps(auxData))
                            logger.debug(r.text)
                        else:
                            logger.debug("No aux_data record worth posting to API because no images were taken")

        except Exception as error:
            logging.error(str(error))

        time.sleep(10)

if __name__ == '__main__':

    """
    Main loop of script.  Attempts to connect to websocket, listen for the 
    arrival of new events, make api requests to the Teradek Cube deveices, 
    save the framegrab images, and insert the image filepaths as auxData 
    objects into Sealog via the Sealog API.
    """

    import argparse

    parser = argparse.ArgumentParser(description='Alvin Framegrabber auxData Inserter')
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
