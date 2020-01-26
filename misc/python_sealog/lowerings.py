import requests
import json
import logging

from .settings import apiServerURL, headers, loweringsAPIPath

def getLoweringUIDByID(lowering_id):

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


def getLoweringUIDsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      lowerings = json.loads(r.text)
      logging.debug(json.dumps(lowerings))
      return (lowering['id'] for lowering in lowerings)

  except Exception as error:
    print(r.text)
    print(error)


def getLoweringIDsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      lowerings = json.loads(r.text)
      logging.debug(json.dumps(lowerings))
      return (lowering['lowering_id'] for lowering in lowerings)

  except Exception as error:
    print(r.text)
    print(error)


def getLowering(lowering_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/' + lowering_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      lowering = json.loads(r.text)
      logging.debug(json.dumps(lowering))
      return lowering
  
  except Exception as error:
    print(r.text)
    print(error)

def getLoweringByID(lowering_id):

  try:
    url = apiServerURL + loweringsAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
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

    if r.status_code != 404:
      lowerings = json.loads(r.text)
      logging.debug(json.dumps(lowerings))
      return lowerings

  except Exception as error:
    print(r.text)
    print(error)

def getLoweringByEvent(event_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/byevent/' + event_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      lowering = json.loads(r.text)
      logging.debug(json.dumps(lowering))
      return lowering

  except Exception as error:
    print(r.text)
    print(error)
