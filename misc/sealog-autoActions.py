#!/usr/bin/env python3
#
# Purpose: This service listens for new events submitted to Sealog
#          and performs additional actions depending on the recieved
#          event.
#
#          Currently this service listens for "Vehicle in water" and "Vehicle
#          on deck" events and enables/disables the ASNAP functionality.
#
#   Usage: Type python3 sealog-autoActions.py to start the service.
#
#          This serivce runs in the forground. Type ^d to kill the service.
#
#  Author: Webb Pinner webbpinner@gmail.com
# Created: 2018-09-26
# Modified: 2019-10-17

import asyncio
import websockets
import json
import requests
import logging
import sys
import os
from pymongo import MongoClient

import python_sealog
from python_sealog.custom_vars import getCustomVarUid
from python_sealog.settings import apiServerURL, wsServerURL, cruisesAPIPath, eventsAPIPath, customVarAPIPath, headers

asnapStatusVarName = 'asnapStatus'
asnapStatusVarID = None

includeSet = ('VEHICLE')

clientWSID = 'autoActions'

hello = {
    'type': 'hello',
    'id': clientWSID,
    'auth': {
        'headers': headers
    },
    'version': '2',
    'subs': ['/ws/status/newEvents', '/ws/status/updateEvents']
}

ping = {
    'type':'ping',
    'id':clientWSID
}

auxDataTemplate = {
    'event_id': None,
    'data_source': None,
    'data_array': []
}

client = MongoClient()
db = client.datagrabberDB
collection = db.datagrabberCOLL

LOG_LEVEL = logging.INFO

# create logger
logger = logging.getLogger(__file__ )
logger.setLevel(LOG_LEVEL)

# create console handler and set level to debug
ch = logging.StreamHandler()
ch.setLevel(LOG_LEVEL)

# create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

async def autoActions():
  try:

    global asnapStatusVarID

    async with websockets.connect(wsServerURL) as websocket:

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
              if option['event_option_name'] == "milestone" and option['event_option_value'] == "Vehicle in water":
                logger.info("Turning on ASNAP")
                payload = { "custom_var_value": "On"}
                r = requests.patch(apiServerURL + customVarAPIPath + '/' + asnapStatusVarID, headers=headers, data = json.dumps(payload))
              elif option['event_option_name'] == "milestone" and option['event_option_value'] == "Vehicle on deck":
                logger.info("Turning off ASNAP")
                payload = { "custom_var_value": "Off"}
                r = requests.patch(apiServerURL + customVarAPIPath + '/' + asnapStatusVarID, headers=headers, data = json.dumps(payload))
          else:
            logger.debug("Skipping because event value is not in the include set")

  except Exception as error:
    logging.error(str(error))


if __name__ == '__main__':

  import argparse
  import os
  import sys

  parser = argparse.ArgumentParser(description='Auto-Actions Service')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")
    
  # Retrieve the asnapStatus ID
  try:
    asnapStatusVarID = getCustomVarUid(asnapStatusVarName)
  except Exception as error:
    logger.error("Error retrieving the asnapStatus ID")
    logger.error(str(error))

  # Run the main loop
  try:
    asyncio.get_event_loop().run_until_complete(autoActions())
  except KeyboardInterrupt:
    print('Interrupted')
    try:
      sys.exit(0)
    except SystemExit:
      os._exit(0)