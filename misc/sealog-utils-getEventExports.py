#!/usr/bin/env python3

import logging
import python_sealog
from python_sealog.event_exports import getEventExportsByLoweringUid
from python_sealog.lowerings import getLoweringUid

# Default logging level
LOG_LEVEL = logging.INFO

# create logger
logger = logging.getLogger(__file__)
logger.setLevel(LOG_LEVEL)

# create console handler and set level to debug
ch = logging.StreamHandler()
ch.setLevel(LOG_LEVEL)

# create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

if __name__ == '__main__':

  import argparse

  parser = argparse.ArgumentParser(description='Export events and aux_data for a lowering')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('-c', '--csv', action='store_true', help=' export events and aux_data as csv file')
  parser.add_argument('lowering_id', help='Lowering ID i.e. "J2-1111".')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  export_format = 'json'
  if args.csv:
    export_format = 'csv'  

  lowering_uid = getLoweringUid(args.lowering_id)
  if not lowering_uid == None:
    logger.debug("Logger UID: " + lowering_uid)
    print(getEventExportsByLoweringUid(lowering_uid, export_format))