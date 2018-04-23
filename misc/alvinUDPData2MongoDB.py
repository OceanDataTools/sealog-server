import socket
import logging
import datetime
import time
import json
import sys
import os
from pymongo import MongoClient

UDP_IP_ADDRESS = "127.0.0.1"
UDP_PORT_NO = 10600

LOG_LEVEL = logging.DEBUG

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

def parseCSV(message):
  """
  This function parses the standard CSV string from the Alvin control system and returns the folowing data object:

  {
    "label": "CSV",
    "data": {
      "date_time": <string>,
      "vehicle_name": <string>,
      "latitude": <string>,
      "longitude": <string>,
      "depth": <string>,
      "heading": <string>,
      "pitch": <string>,
      "roll": <string>,
      "altitude": <string>
    }  
  }

  """

  msg_array = message.split(",")

  record = {
    "label": msg_array[0],
    "data": {
      "date_time": msg_array[1],
      "vehicle_name": msg_array[2],
      "latitude": msg_array[3],
      "longitude": msg_array[4],
      "depth": msg_array[5],
      "heading": msg_array[6],
      "pitch": msg_array[7],
      "roll": msg_array[8],
      "altitude": msg_array[9]
    }
  }

  return record

def main():
  """
  This is the main function for this script.  It connects to the specified UDP 
  port, listens for incoming messages, parses the message into a data object and 
  inserts the data object into a MongoDB document.

  How the message is parse, how the data object is constructed and how the data 
  object is uploaded into the database is dependent on the first column of the
  message.
  """

  client = MongoClient()
  db = client.datagrabberDB
  collection = db.datagrabberCOLL

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
      logger.debug("Message: " + data)

      record = None
      if(messageType == 'CSV'):
        record = parseCSV(data)
      # elif(messageType == 'CSV'):
        # record = parseCSV(data)
      # elif(messageType == 'CSV'):
        # record = parseCSV(data)
      # elif(messageType == 'CSV'):
        # record = parseCSV(data)
      
      if record:
        logger.debug("Record" + json.dumps(record, indent=2))

        collection.update_one({'label': messageType}, {'$set': record}, upsert=True)        

if __name__ == '__main__':
  """
  This script connects to the specified UDP port, listens for incoming messages, 
  parses the message into a data object and inserts the data object into a 
  MongoDB document.

  How the message is parse, how the data object is constructed and how the data 
  object is uploaded into the database is dependent on the first column of the
  message.
  """

  import argparse

  parser = argparse.ArgumentParser(description='Alvin Data to MongoDB Inserter')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logging.getLogger().setLevel(logging.DEBUG)

    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
  
  try:
    main()
  except KeyboardInterrupt:
    print('Interrupted')
    try:
      sys.exit(0)
    except SystemExit:
      os._exit(0)

