import requests
import json
import logging

from .settings import apiServerURL, headers, cruisesAPIPath, loweringsAPIPath

def getCruise(cruise_uid, export_format='json'):

  try:
    url = apiServerURL + cruisesAPIPath + '/' + cruise_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error

def getCruises(export_format='json'):

  try:
    url = apiServerURL + cruisesAPIPath + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

    if r.status_code == 404:
      if export_format == 'json':
        return []
      elif export_format == 'csv':
        return ""
      else:
        return None


  except Exception as error:
    logging.error(str(error))
    raise error

def getCruiseUIDByID(cruise_id):

  try:
    url = apiServerURL + cruisesAPIPath + '?cruise_id=' + cruise_id
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      cruise = json.loads(r.text)[0]
      return cruise['id']

  except Exception as error:
    logging.error(str(error))
    raise error


def getCruiseByID(cruise_id, export_format='json'):

  try:
    url = apiServerURL + cruisesAPIPath + '?cruise_id=' + cruise_id + '&format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)[0]
      elif export_format == 'csv':
        return r.text
      else:
        return None

  except Exception as error:
    logging.error(str(error))  
    raise error


def getCruiseByLowering(lowering_uid, export_format='json'):

  try:
    url = apiServerURL + cruisesAPIPath + '/bylowering/' + lowering_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error


def getCruiseByEvent(event_uid, export_format='json'):

  try:
    url = apiServerURL + cruisesAPIPath + '/byevent/' + event_uid + '?format=' + export_format
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      if export_format == 'json':
        return json.loads(r.text)
      elif export_format == 'csv':
        return r.text
      else:
        return None

  except Exception as error:
    logging.error(str(error))
    raise error
