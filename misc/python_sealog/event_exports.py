import requests
import json
import logging

from .settings import apiServerURL, headers, eventExportsAPIPath

def getEventExportsByCruise(cruise_uid, export_format='json'):

  try:
    url = apiServerURL + eventExportsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      events = json.loads(r.text)
      logging.debug(json.dumps(events))
      return events

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error

def getEventExportsByLowering(lowering_uid, export_format='json'):

  try:
    url = apiServerURL + eventExportsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    events = json.loads(r.text)
    logging.debug(json.dumps(events))
    return events

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error
