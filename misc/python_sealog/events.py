import requests
import json
import logging

from .settings import apiServerURL, headers, eventsAPIPath

def getEventsByLoweringUid(lowering_uid, export_format='json'):

  try:
    url = apiServerURL + eventsAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    events = json.loads(r.text)
    logging.debug(json.dumps(events))
    return events

  except Exception as error:
    print(r.text)
    print(error)
