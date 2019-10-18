import requests
import json
import logging

from .settings import apiServerURL, headers, eventsAPIPath

def getEventsByCruiseUid(cruise_uid, export_format='json'):

  try:
    url = apiServerURL + eventsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      events = json.loads(r.text)
      logging.debug(json.dumps(events))
      return events

  except Exception as error:
    print(r.text)
    print(error)

def getEventsByLoweringUid(lowering_uid, export_format='json'):

  try:
    url = apiServerURL + eventsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      events = json.loads(r.text)
      logging.debug(json.dumps(events))
      return events

  except Exception as error:
    print(r.text)
    print(error)
