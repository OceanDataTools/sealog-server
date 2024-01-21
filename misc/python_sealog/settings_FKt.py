#!/usr/bin/env python3
'''
FILE:           settings.py

DESCRIPTION:    This file contains the settings used by the wrapper functions
				to communicate with the sealog-server API

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    0.1
CREATED:    2021-01-01
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

API_SERVER_URL = 'http://localhost:8000/sealog-server'
WS_SERVER_URL = 'ws://localhost:8000/ws'

CRUISES_API_PATH = '/api/v1/cruises'

CUSTOM_VAR_API_PATH = '/api/v1/custom_vars'

EVENTS_API_PATH = '/api/v1/events'

EVENT_AUX_DATA_API_PATH = '/api/v1/event_aux_data'

EVENT_EXPORTS_API_PATH = '/api/v1/event_exports'

EVENT_TEMPLATES_API_PATH = '/api/v1/event_templates'

LOWERINGS_API_PATH = '/api/v1/lowerings'

API_SERVER_FILE_PATH = '/data/sealog-FKt-files'

TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIl0sInJvbGVzIjpbImFkbWluIiwiZXZlbnRfd2F0Y2hlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X21hbmFnZXIiLCJjcnVpc2VfbWFuYWdlciJdLCJpYXQiOjE2NzA2NTg5ODV9.W8e7A13z111zsrJqGtn4fhOJjGaF4M02qbBGljlnpAs'

HEADERS = {
  "authorization": TOKEN
}
