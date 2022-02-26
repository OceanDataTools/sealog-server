#!/usr/bin/env python3
'''
FILE:           test_python_sealog.py

DESCRIPTION:    This script attempts to test all the functions in the
                python_sealog wrapper.  For this to pass the server must be run
                in devel mode, i.e. npm run start-devel

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-04-21
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import sys

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.cruises import get_cruises, get_cruise, get_cruise_uid_by_id, get_cruise_by_id, get_cruise_by_lowering, get_cruise_by_event
from misc.python_sealog.lowerings import get_lowerings, get_lowering, get_lowering_uid_by_id, get_lowering_by_id, get_lowerings_by_cruise, get_lowering_uids_by_cruise, get_lowering_ids_by_cruise, get_lowering_by_event
from misc.python_sealog.events import get_event, get_events_by_cruise, get_events_by_lowering

CRUISE_UID = '5981f167212b348aed7fa9f5'
CRUISE_ID = 'AT37-13'
LOWERING_UID = '6981f167212b348aed7fa9f5'
LOWERING_ID = '4928'
EVENT_UID = '5981f167212b348aed7fa9f5'
EVENT_FILTER = 'FISH'

print("Cruises")
print("get_cruises() ", end='')
if get_cruises() is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruises(export_format='csv') ", end='')
if get_cruises(export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise(CRUISE_UID) ", end='')
if get_cruise(CRUISE_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise(CRUISE_UID, export_format='csv') ", end='')
if get_cruise(CRUISE_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_uid_by_id(CRUISE_ID) ", end='')
if get_cruise_uid_by_id(CRUISE_ID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_id(CRUISE_ID) ", end='')
if get_cruise_by_id(CRUISE_ID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_id(CRUISE_ID, export_format='csv') ", end='')
if get_cruise_by_id(CRUISE_ID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_lowering(LOWERING_UID) ", end='')
if get_cruise_by_lowering(LOWERING_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_lowering(LOWERING_UID, export_format='csv') ", end='')
if get_cruise_by_lowering(LOWERING_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_event(EVENT_UID) ", end='')
if get_cruise_by_event(EVENT_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_cruise_by_event(EVENT_UID, export_format='csv') ", end='')
if get_cruise_by_event(EVENT_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print()
print("Lowerings")
print("get_lowerings() ", end='')
if get_lowerings() is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowerings(export_format='csv') ", end='')
if get_lowerings(export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_uid_by_id(LOWERING_ID) ", end='')
if get_lowering_uid_by_id(LOWERING_ID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_uids_by_cruise(CRUISE_UID) ", end='')
if get_lowering_uids_by_cruise(CRUISE_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_ids_by_cruise(CRUISE_UID) ", end='')
if get_lowering_ids_by_cruise(CRUISE_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering(LOWERING_UID) ", end='')
if get_lowering(LOWERING_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering(LOWERING_UID, export_format='csv') ", end='')
if get_lowering(LOWERING_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_by_id(LOWERING_ID) ", end='')
if get_lowering_by_id(LOWERING_ID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_by_id(LOWERING_ID, export_format='csv') ", end='')
if get_lowering_by_id(LOWERING_ID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowerings_by_cruise(CRUISE_UID) ", end='')
if get_lowerings_by_cruise(CRUISE_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowerings_by_cruise(CRUISE_UID, export_format='csv') ", end='')
if get_lowerings_by_cruise(CRUISE_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_by_event(EVENT_UID) ", end='')
if get_lowering_by_event(EVENT_UID) is not None:
    print('PASS')
else:
    print('FAIL')

print("get_lowering_by_event(EVENT_UID, export_format='csv') ", end='')
if get_lowering_by_event(EVENT_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')


print()
print("Events")
print("get_event(EVENT_UID) ", end='')
if get_event(EVENT_UID) is not None:
    print('PASS')
else:
    print('FAIL')
print("get_event(EVENT_UID, export_format='csv') ", end='')
if get_event(EVENT_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_cruise(CRUISE_UID) ", end='')
if get_events_by_cruise(CRUISE_UID) is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_cruise(CRUISE_UID, export_format='csv') ", end='')
if get_events_by_cruise(CRUISE_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_cruise(CRUISE_UID, export_format='csv', event_filter=EVENT_FILTER) ", end='')
if get_events_by_cruise(CRUISE_UID, export_format='csv', event_filter=EVENT_FILTER) is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_lowering(LOWERING_UID) ", end='')
if get_events_by_lowering(LOWERING_UID) is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_lowering(LOWERING_UID, export_format='csv') ", end='')
if get_events_by_lowering(LOWERING_UID, export_format='csv') is not None:
    print('PASS')
else:
    print('FAIL')
print("get_events_by_lowering(LOWERING_UID, export_format='csv', event_filter=EVENT_FILTER) ", end='')
if get_events_by_lowering(LOWERING_UID, export_format='csv', event_filter=EVENT_FILTER) is not None:
    print('PASS')
else:
    print('FAIL')
