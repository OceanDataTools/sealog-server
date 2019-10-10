#!/usr/bin/env python3
#
# Purpose: This service listens to the specified UDP port and specified
#          message headers, parses those messages and caches the lastest
#          values to a MongoDB collection.
#
#   Usage: Type python3 sealog-udp2MongoDB.py to start the service.
#
#          This serivce runs in the forground. Type ^d to kill the
#          service.
#
#  Author: Webb Pinner webbpinner@gmail.com
# Created: 2018-09-26

import socket
import logging
import datetime
import time
import json

from pymongo import MongoClient

UDP_IP_ADDRESS = "0.0.0.0"
UDP_PORT_NO = 10600

LOG_LEVEL = logging.INFO

# Valid line headers to process
validLineLabels = ['JDS','ODR']

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

def parseJDS(message):

  msg_array = message.split(" ")

  date_time = str(msg_array[1] + ' ' + msg_array[2])

  record = {
    "label": msg_array[0],
    "data": {
      "date_time": date_time,
      "vehicle_name": msg_array[3],
      "latitude": msg_array[4],
      "longitude": msg_array[5],
      "alvin_x": msg_array[6],
      "alvin_y": msg_array[7],
      "roll": msg_array[8],
      "pitch": msg_array[9],
      "heading": msg_array[10],
      "depth": msg_array[11],
      "altitude": msg_array[12],
      "runtime": msg_array[13],
      "wraps": msg_array[14],
    }
  }

  return record

def parseODR(message):

  msg_array = message.split(" ")

  date_time = str(msg_array[1] + ' ' + msg_array[2])

  record = {
    "label": msg_array[0],
    "data": {
      "date_time": date_time,
      "vehicle_name": msg_array[3],
      "orig_lat": msg_array[4],
      "orig_lon": msg_array[5],
      "utm_zone": msg_array[6],
      "cruise_id": msg_array[7],
      "dive_id": msg_array[8],
    }
  }

  return record

def insertUDPData():

  client = MongoClient()
  db = client.udpDataCache
  collection = db.navData

  serverSock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
  serverSock.bind((UDP_IP_ADDRESS, UDP_PORT_NO))

  while True:
    data, addr = serverSock.recvfrom(1024)

    messageType = None
    for label in validLineLabels:
      if data.startswith(label):
        messageType = label
        break

    if(messageType):
      data = data.rstrip()

      record = None
      if(messageType == 'JDS'):
        record = parseJDS(data)
      elif(messageType == 'ODR'):
        record = parseODR(data)
      # elif(messageType == 'something'):
      # elif(messageType == 'else'):

      if record:
        logger.debug("Record" + json.dumps(record, indent=2))

        collection.update_one({'label': messageType}, {'$set': record}, upsert=True)        

if __name__ == '__main__':

  import argparse

  parser = argparse.ArgumentParser(description='UDP Data Caching Service')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")
    
  # Run the main loop
  try:
    insertUDPData()
  except KeyboardInterrupt:
    print('Interrupted')
    try:
      sys.exit(0)
    except SystemExit:
      os._exit(0)
