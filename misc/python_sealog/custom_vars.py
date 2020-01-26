import requests
import json
import logging

from .settings import apiServerURL, headers, customVarAPIPath

def getCustomVar(var_uid):

  try:
    url = apiServerURL + customVarAPIPath + '/' + var_uid
    r = requests.get(url, headers=headers)
    logging.debug(r.text)

    if r.status_code != 404:
      customVar = json.loads(r.text)
      logging.debug(json.dumps(customVar))
      return customVar

  except Exception as error:
    logging.error('Error retrieving custom variable ID')
    logging.error(str(error))

def getCustomVarUidByName(var_name):

  try:
    url = apiServerURL + customVarAPIPath
    r = requests.get(url, headers=headers)
    logging.debug(r.text)

    if r.status_code != 404:
      customVars = json.loads(r.text)
      for customVar in customVars:
        if customVar['custom_var_name'] == var_name:
          return customVar['id']

  except Exception as error:
    logging.error('Error retrieving custom variable ID')
    logging.error(str(error))
