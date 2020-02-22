import requests
import json
import logging

from .settings import apiServerURL, headers, cruisesAPIPath, loweringsAPIPath

def getCruise(cruise_uid):

  try:
    url = apiServerURL + cruisesAPIPath + '/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruise = json.loads(r.text)
      logging.debug(json.dumps(cruise))
      return cruise

  except Exception as error:
    logging.error(str(error))
    raise error

def getCruises():

  try:
    url = apiServerURL + cruisesAPIPath
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruises = json.loads(r.text)
      return cruises

  except Exception as error:
    logging.error(str(error))
    raise error

def getCruiseUIDByID(cruise_id):

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
    raise error


def getCruiseByID(cruise_id):

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
    raise error


def getCruiseByLowering(lowering_uid):

  try:
    url = apiServerURL + cruisesAPIPath + '/bylowering/' + lowering_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruise = json.loads(r.text)
      logging.debug(json.dumps(cruise))
      return cruise

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error


def getCruiseByEvent(event_uid):

  try:
    url = apiServerURL + cruisesAPIPath + '/byevent/' + event_uid
    r = requests.get(url, headers=headers)

    if r.status_code != 404:
      cruise = json.loads(r.text)
      logging.debug(json.dumps(cruise))
      return cruise

  except Exception as error:
    logging.error(r.text)
    logging.debug(str(error))
    raise error
