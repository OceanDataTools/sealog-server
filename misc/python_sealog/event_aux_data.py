import requests
import json
import logging

from .settings import apiServerURL, headers, eventAuxDataAPIPath

def getEventAuxDataByLoweringUid(lowering_uid):

  try:
    url = apiServerURL + eventAuxDataAPIPath + '/bylowering/' + lowering_uid
    r = requests.get(url, headers=headers)

    eventAuxData = json.loads(r.text)
    logging.debug(json.dumps(eventAuxData))
    return eventAuxData

  except Exception as error:
    print(r.text)
    print(error)
