import requests
import json
import logging

from .settings import apiServerURL, headers, cruisesAPIPath

def getCruiseUid(cruise_id):

  try:
    url = apiServerURL + cruisesAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruises = json.loads(r.text)
      for cruise in cruises:
        if cruise['cruise_id'] == cruise_id:
          logging.debug(json.dumps(cruise))
          return cruise['id']
  except Exception as error:
    logging.error(str(error))


def getCruise(cruise_id):

  try:
    url = apiServerURL + cruisesAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruises = json.loads(r.text)
      for cruise in cruises:
        if cruise['cruise_id'] == cruise_id:
          logging.debug(json.dumps(cruise))
          return cruise
  except Exception as error:
    logging.error(str(error))  