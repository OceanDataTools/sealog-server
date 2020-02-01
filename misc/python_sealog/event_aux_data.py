import requests
import json
import logging

from .settings import apiServerURL, headers, eventAuxDataAPIPath

def getEventAuxDataByCruise(cruise_uid):

  try:
    url = apiServerURL + eventAuxDataAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      eventAuxData = json.loads(r.text)
      logging.debug(json.dumps(eventAuxData))
      return eventAuxData

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error


def getEventAuxDataByLowering(lowering_uid):

  try:
    url = apiServerURL + eventAuxDataAPIPath + '/bylowering/' + lowering_uid
    r = requests.get(url, headers=headers)

    eventAuxData = json.loads(r.text)
    logging.debug(json.dumps(eventAuxData))
    return eventAuxData

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error