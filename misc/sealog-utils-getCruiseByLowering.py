#!/usr/bin/env python3

import logging
import python_sealog
from python_sealog.cruises import getCruiseByLowering
from python_sealog.lowerings import getLoweringByID

# Default logging level
LOG_LEVEL = logging.INFO

# create logger
logger = logging.getLogger(__file__)
logger.setLevel(LOG_LEVEL)

# create console handler and set level to debug
ch = logging.StreamHandler()
ch.setLevel(LOG_LEVEL)

# create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

if __name__ == '__main__':

  import argparse

  parser = argparse.ArgumentParser(description='Retrieve Cruise from Lowering ID')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('lowering_id', help='Lowering ID i.e. "J2-1001".')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  lowering_uid = getLoweringByID(args.lowering_id)

  if not lowering_uid:
    logger.error("No cruise found for lowering_id: " + args.lowering_id)

  else:
    cruise = getCruiseByLowering(lowering_uid)
    if cruise != None:
      print(cruise)
    else:
      logger.error("No cruise found for lowering_id: " + args.lowering_id)