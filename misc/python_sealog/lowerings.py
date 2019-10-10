import requests
import json
import logging

from .settings import apiServerURL, headers, loweringsAPIPath

def getLoweringUid(lowering_id):

  try:
    url = apiServerURL + loweringsAPIPath
    r = requests.get(url, headers=headers)

    lowerings = json.loads(r.text)
    for lowering in lowerings:
      if lowering['lowering_id'] == lowering_id:
        logging.debug(json.dumps(lowering))
        return lowering['id']
  except Exception as error:
    print(r.text)
    print(error)


def getLoweringUidsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    lowerings = json.loads(r.text)
    logging.debug(json.dumps(lowerings))
    return (lowering['id'] for lowering in lowerings)

  except Exception as error:
    print(r.text)
    print(error)


def getLoweringIdsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    lowerings = json.loads(r.text)
    logging.debug(json.dumps(lowerings))
    return (lowering['lowering_id'] for lowering in lowerings)

  except Exception as error:
    print(r.text)
    print(error)


def getLowering(lowering_id):

  try:
    url = apiServerURL + loweringsAPIPath
    r = requests.get(url, headers=headers)

    lowerings = json.loads(r.text)
    for lowering in lowerings:
      if lowering['lowering_id'] == lowering_id:
        logging.debug(json.dumps(lowering))
        return lowering
  except Exception as error:
    print(r.text)
    print(error)


def getLoweringsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    lowerings = json.loads(r.text)
    logging.debug(json.dumps(lowerings))
    return lowerings

  except Exception as error:
    print(r.text)
    print(error)
