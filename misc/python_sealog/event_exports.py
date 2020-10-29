import requests
import json
import logging

from .settings import apiServerURL, headers, eventExportsAPIPath

def getEventExport(event_uid):

  try:
    url = apiServerURL + eventExportsAPIPath + '/' + event_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      event = json.loads(r.text)
      logging.debug(json.dumps(event))
      return event

  except Exception as error:
    logging.debug(str(error))
    raise error

def getEventExportsByCruise(cruise_uid, export_format='json', filter=''):

  try:
    url = apiServerURL + eventExportsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format

    if filter != '':
      url += '&value=' + filter

    r = requests.get(url, headers=headers)

    if r.status_code != 404:

      if export_format == 'json':
        events = json.loads(r.text)
        return events

      return r.text

  except Exception as error:
    logging.debug(str(error))
    raise error

def getEventExportsByLowering(lowering_uid, export_format='json', filter=''):

  try:
    url = apiServerURL + eventExportsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format

    if filter != '':
      url += '&value=' + filter

    r = requests.get(url, headers=headers)

    if r.status_code != 404:

      if export_format == 'json':
        events = json.loads(r.text)
        return events

      return r.text

  except Exception as error:
    logging.debug(str(error))
    raise error
