import requests
import json
import logging

from .settings import apiServerURL, headers, eventsAPIPath

def getEvent(event_uid):

  try:
    url = apiServerURL + eventsAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      event = json.loads(r.text)
      logging.debug(json.dumps(event))
      return event
  
  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error


def getEventsByCruise(cruise_uid, export_format='json', filter=''):

  if filter != '':
      url += '&value=' + filter

  try:
    url = apiServerURL + eventsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      events = json.loads(r.text)
      logging.debug(json.dumps(events))
      return events

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error


def getEventsByLowering(lowering_uid, export_format='json', filter=''):

  try:
    url = apiServerURL + eventsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format

    if filter != '':
      url += '&value=' + filter

    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      events = json.loads(r.text)
      logging.debug(json.dumps(events))
      return events

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error
