#!/usr/bin/env python3

import logging
import python_sealog
from python_sealog.event_aux_data import getEventAuxDataByLoweringUid, getEventAuxDataByCruiseUid
from python_sealog.lowerings import getLoweringUid
from python_sealog.cruises import getCruiseUid

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

  parser = argparse.ArgumentParser(description='Retrieve event aux data for a lowering or cruise')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('-c', '--cruise_id', help='Cruise ID i.e. "RR1808".')
  parser.add_argument('-l', '--lowering_id', help='Lowering ID i.e. "J2-1111".')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  if args.lowering_id and args.cruise_id:
    logger.error("Must define either a cruise_id or Lowering_id")
  elif args.lowering_id:
    lowering_uid = getLoweringUid(args.lowering_id)
    if not lowering_uid == None:
      logger.debug("Lowering UID: " + lowering_uid)
      event_aux_data = getEventAuxDataByLoweringUid(lowering_uid)
      if not event_aux_data == None:
        print(event_aux_data)
      else:
        logger.error("No event aux data found for lowering_id: " + args.lowering_id)
    else:
      logger.error("No lowering found for lowering_id: " + args.lowering_id)
  elif args.cruise_id:
    cruise_uid = getCruiseUid(args.cruise_id)
    if not cruise_uid == None:
      logger.debug("Cruise UID: " + cruise_uid)
      event_aux_data = getEventAuxDataByCruiseUid(cruise_uid)
      if not event_aux_data == None:
        print(event_aux_data)
      else:
        logger.error("No event aux data found for cruise_id: " + args.cruise_id)
    else:
      logger.error("No cruise found for cruise_id: " + args.cruise_id)
  else:
    logger.error("Must define either a cruise_id or Lowering_id")
