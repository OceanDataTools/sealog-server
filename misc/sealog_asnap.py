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
customVarAPIPath = '/api/v1/custom_vars'
asnapStatusVarName = 'asnapStatus'

interval = 10 #seconds

clientWSID = "asnap"

token_devel = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3ODM5NjYyfQ.YCLG0TcDUuLtaYVgnfxC7R-y3kWZcZGtyMcvI2xYFYA"
token_prod =  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVhZTQ0ZGUwNjczMTI2MDY2NDZlZmJkYyIsInNjb3BlIjpbImFkbWluIl0sImlhdCI6MTUyNDkxMTY0MH0.3q0Wg_kKRkThzW5JFNhbBImn7LGk4TFT40lwl-CZ4_8"

token = token_devel

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

eventTemplate = {
  "event_value": "ASNAP",
  "event_options": [],
  "event_free_text": ""
}

def main():
    """
    This is the main function for this script.  It creates a new event request at the specified interval
    """

    runFlag = True
    while True:
        try:
            r = requests.get('http://' + serverIP + ':' + serverAPIPort + serverPath + customVarAPIPath + '?name=' + asnapStatusVarName, headers=headers )
            print("text", r.text)
            response = json.loads(r.text)
            print("response:", response)
            if len(response) > 0:
                print("status:", response[0]['custom_var_value'])
                if response[0]['custom_var_value'] == 'On':
                    runFlag = True
                elif response[0]['custom_var_value'] == 'Off':
                    runFlag = False
        except Exception as error:
            print(error)

        if runFlag:
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


