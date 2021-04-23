import requests
import json
import logging

from .settings import apiServerURL, headers, loweringsAPIPath

def getLoweringUIDByID(lowering_id):

  try:
    url = apiServerURL + loweringsAPIPath + '?lowering_id=' + lowering_id
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      lowering = json.loads(r.text)[0]
      return lowering['id']

  except Exception as error:
    logging.error(str(error))
    raise error


def getLowerings(export_format='json'):

  try:
    url = apiServerURL + loweringsAPIPath + '?format=' + export_format
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


def getLoweringUIDsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      lowerings = json.loads(r.text)
      return (lowering['id'] for lowering in lowerings)

    if r.status_code == 404:
      return []

  except Exception as error:
    logging.error(str(error))
    raise error


def getLoweringIDsByCruise(cruise_uid):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
      lowerings = json.loads(r.text)
      return (lowering['lowering_id'] for lowering in lowerings)

    if r.status_code == 404:
      return []

  except Exception as error:
    logging.error(str(error))
    raise error


def getLowering(lowering_uid, export_format='json'):

  try:
    url = apiServerURL + loweringsAPIPath + '/' + lowering_uid + '?format=' + export_format
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

def getLoweringByID(lowering_id, export_format='json'):

  try:
    url = apiServerURL + loweringsAPIPath + '?lowering_id=' + lowering_id + '&format=' + export_format
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

def getLoweringsByCruise(cruise_uid, export_format='json'):

  try:
    url = apiServerURL + loweringsAPIPath + '/bycruise/' + cruise_uid + '?format=' + export_format
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

def getLoweringByEvent(event_uid, export_format='json'):

  try:
    url = apiServerURL + loweringsAPIPath + '/byevent/' + event_uid + '?format=' + export_format
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
