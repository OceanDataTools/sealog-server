import requests
import json
import logging

from settings import apiServerURL, headers, customVarAPIPath

def getCustomVarUid(var_name):

  try:
    url = apiServerURL + customVarAPIPath
    r = requests.get(url, headers=headers)
    logging.debug(r.text)

    customVars = json.loads(r.text)
    for customVar in customVars:
      if customVar['custom_var_name'] == var_name:
        return customVar['id']

  except Exception as error:
    logging.error('Error retrieving custom variable ID')
    logging.error(str(error))
