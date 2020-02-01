import requests
import json
import logging

from .settings import apiServerURL, headers, eventTemplatesAPIPath

def getEventTemplates():

  try:
    url = apiServerURL + eventTemplatesAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      eventTemplates = json.loads(r.text)
      logging.debug(json.dumps(eventTemplates))
      return eventTemplates

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error