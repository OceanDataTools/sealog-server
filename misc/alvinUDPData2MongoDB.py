import socket
import logging
import datetime
import time
import json

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


      if record:
        logger.debug("Record" + json.dumps(record, indent=2))

        collection.update_one({'label': messageType}, {'$set': record}, upsert=True)        
      # elif(messageType == 'CSV'):
      # elif(messageType == 'CSV'):
      # elif(messageType == 'CSV'):

if __name__ == '__main__':

  import argparse

  parser = argparse.ArgumentParser(description='Alvin Simulator')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logging.getLogger().setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
  
  main()
