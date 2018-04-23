#!/usr/bin/env python3

import json
import requests
import time
import sys
import os

serverIP = '0.0.0.0'
serverAPIPort = '8000'
serverWSPort = '8001'
serverPath = '/sealog-server'
eventAPIPath = '/api/v1/events'

interval = 10 #in seconds

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3ODM5NjYyfQ.YCLG0TcDUuLtaYVgnfxC7R-y3kWZcZGtyMcvI2xYFYA"
token_prod =  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI0MTc4NTE4fQ.DGy2i2lyBbCyuao56YZqP0w5moJEROqQQeVVI6rRDgQ"

token = token_devel

hello = {
    'type': 'hello',
    'id': 'abcdefg',
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
    'id':'abcdefg'
}

headers = {'authorization': token}

eventTemplate = {
  "event_value": "ASNAP",
  "event_options": [],
  "event_free_text": ""
}

def main():
    """
    This is the main function for the script.  It creates a new event request at the specified interval
    """
    while True:
        try:
            r = requests.post('http://' + serverIP + ':' + serverAPIPort + serverPath + eventAPIPath, headers=headers, data = json.dumps(eventTemplate))
            print(r.text)
        except Exception as error:
            print(error)

        time.sleep(interval)

if __name__ == '__main__':
    """
    This script creates a new event request at the specified interval
    """
  
    try:
        main()
    except KeyboardInterrupt:
        print('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)


