
#!/usr/bin/env python3

# For this to pass the server must be run in devel mode
#> npm run start-devel

from python_sealog.cruises import getCruises, getCruise, getCruiseUIDByID, getCruiseByID, getCruiseByLowering, getCruiseByEvent
from python_sealog.lowerings import getLowerings, getLowering, getLoweringUIDByID, getLoweringByID, getLoweringsByCruise, getLoweringUIDsByCruise, getLoweringIDsByCruise, getLoweringByEvent
from python_sealog.events import getEvent, getEventsByCruise, getEventsByLowering

cruise_uid = '5981f167212b348aed7fa9f5'
cruise_id = 'AT37-13'
lowering_uid = '6981f167212b348aed7fa9f5'
lowering_id = '4928'
event_uid = '5981f167212b348aed7fa9f5'
event_filter = 'FISH'

print("Cruises")
print("getCruises() ", end='')
if getCruises() is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruises(export_format='csv') ", end='')
if getCruises(export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruise(cruise_uid) ", end='')
if getCruise(cruise_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruise(cruise_uid, export_format='csv') ", end='')
if getCruise(cruise_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseUIDByID(cruise_id) ", end='')
if getCruiseUIDByID(cruise_id) is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByID(cruise_id) ", end='')
if getCruiseByID(cruise_id) is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByID(cruise_id, export_format='csv') ", end='')
if getCruiseByID(cruise_id, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByLowering(lowering_uid) ", end='')
if getCruiseByLowering(lowering_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByLowering(lowering_uid, export_format='csv') ", end='')
if getCruiseByLowering(lowering_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByEvent(event_uid) ", end='')
if getCruiseByEvent(event_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getCruiseByEvent(event_uid, export_format='csv') ", end='')
if getCruiseByEvent(event_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print()
print("Lowerings")
print("getLowerings() ", end='')
if getLowerings() is not None:
	print('PASS')
else:
	print('FAIL')

print("getLowerings(export_format='csv') ", end='')
if getLowerings(export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringUIDByID(lowering_id) ", end='')
if getLoweringUIDByID(lowering_id) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringUIDsByCruise(cruise_uid) ", end='')
if getLoweringUIDsByCruise(cruise_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringIDsByCruise(cruise_uid) ", end='')
if getLoweringIDsByCruise(cruise_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLowering(lowering_uid) ", end='')
if getLowering(lowering_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLowering(lowering_uid, export_format='csv') ", end='')
if getLowering(lowering_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringByID(lowering_id) ", end='')
if getLoweringByID(lowering_id) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringByID(lowering_id, export_format='csv') ", end='')
if getLoweringByID(lowering_id, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringsByCruise(cruise_uid) ", end='')
if getLoweringsByCruise(cruise_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringsByCruise(cruise_uid, export_format='csv') ", end='')
if getLoweringsByCruise(cruise_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringByEvent(event_uid) ", end='')
if getLoweringByEvent(event_uid) is not None:
	print('PASS')
else:
	print('FAIL')

print("getLoweringByEvent(event_uid, export_format='csv') ", end='')
if getLoweringByEvent(event_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')


print()
print("Events")
print("getEvent(event_uid) ", end='')
if getEvent(event_uid) is not None:
	print('PASS')
else:
	print('FAIL')
print("getEvent(event_uid, export_format='csv') ", end='')
if getEvent(event_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByCruise(cruise_uid) ", end='')
if getEventsByCruise(cruise_uid) is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByCruise(cruise_uid, export_format='csv') ", end='')
if getEventsByCruise(cruise_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByCruise(cruise_uid, export_format='csv', filter=event_filter) ", end='')
if getEventsByCruise(cruise_uid, export_format='csv', filter=event_filter) is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByLowering(lowering_uid) ", end='')
if getEventsByLowering(lowering_uid) is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByLowering(lowering_uid, export_format='csv') ", end='')
if getEventsByLowering(lowering_uid, export_format='csv') is not None:
	print('PASS')
else:
	print('FAIL')
print("getEventsByLowering(lowering_uid, export_format='csv', filter=event_filter) ", end='')
if getEventsByLowering(lowering_uid, export_format='csv', filter=event_filter) is not None:
	print('PASS')
else:
	print('FAIL')