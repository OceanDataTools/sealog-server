import requests
import json
import logging

from .settings import apiServerURL, headers, eventsAPIPath

def getEvent(event_uid, export_format='json'):

  try:
    url = apiServerURL + eventsAPIPath + '/' + event_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error


def getEventsByCruise(cruise_uid, export_format='json', filter=''):

  try:
    url = apiServerURL + eventsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format
    if filter != '':
      url += '&value=' + filter
  
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

    if r.status_code == 404:
      if export_format == 'json':
        return []
      elif export_format == 'csv':
        return ""
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error


def getEventsByLowering(lowering_uid, export_format='json', filter=''):

  try:
    url = apiServerURL + eventsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format
    if filter != '':
      url += '&value=' + filter

    r = requests.get(url, headers=headers)

    if r.status_code == 200:

      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

    if r.status_code == 404:
      if export_format == 'json':
        return []
      elif export_format == 'csv':
        return ""
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error
