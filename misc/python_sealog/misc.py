import requests
import json
import logging

from .settings import apiServerURL, headers, eventAuxDataAPIPath

dataSourceFilter = ['vehicleRealtimeFramegrabberData']
imagePath = "/home/sealog/images";

def getFramegrabListByLoweringUid(id):
  logging.debug("Exporting event data")
  query='&data_source='.join(dataSourceFilter)

  framegrabFilenames = []

  try:
    url = apiServerURL + eventAuxDataAPIPath + '/bylowering/' + id + '?datasource=' + query
    logging.debug("URL: " + url)
    r = requests.get(url, headers=headers)

    framegrabs = json.loads(r.text)
    for data in framegrabs:
      for framegrab in data['data_array']:
        if framegrab['data_name'] == 'filename':
          framegrabFilenames.append(imagePath + framegrab['data_value'])

  except Exception as error:
    logging.error(str(error))

  return framegrabFilenames

def getFramegrabListByCruiseUid(id):
  logging.debug("Exporting event data")
  query='&data_source='.join(dataSourceFilter)

  framegrabFilenames = []

  try:
    url = apiServerURL + eventAuxDataAPIPath + '/bycruise/' + id + '?datasource=' + query
    logging.debug("URL: " + url)
    r = requests.get(url, headers=headers)

    framegrabs = json.loads(r.text)
    for data in framegrabs:
      for framegrab in data['data_array']:
        if framegrab['data_name'] == 'filename':
          framegrabFilenames.append(imagePath + framegrab['data_value'])

  except Exception as error:
    logging.error(str(error))

  return framegrabFilenames

def getFramegrabListByFile(filename):

  logging.debug(filename)
  framegrabFilenames = []

  try:
    f = open(filename)
    r = json.loads(f.read())
    # logging.debug(r)

    for data in r:
      if data['data_source'] in dataSourceFilter:
        for framegrab in data['data_array']:
          if framegrab['data_name'] == 'filename':
            framegrabFilenames.append(imagePath + framegrab['data_value'])

  except Exception as error:
    logging.error(str(error))

  return framegrabFilenames

