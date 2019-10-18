#!/usr/bin/env python3
import os
import logging
import python_sealog
from python_sealog.misc import getFramegrabListByLoweringUid, getFramegrabListByCruiseUid, getFramegrabListByFile
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

  parser = argparse.ArgumentParser(description='Retrieve list of framegrab files by Lowering ID')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('-c', '--cruise_id', help='cruise ID i.e. "RR1801".')
  parser.add_argument('-l', '--lowering_id', help='lowering ID i.e. "J2-1111".')
  parser.add_argument('-f', '--aux_data_file', help='aux_data_file.')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  if args.lowering_id and args.cruise_id or args.lowering_id and args.aux_data_file or args.cruise_id and args.aux_data_file:
    logger.error("Must define either a cruise_id, lowering_id or aux data filename")
  elif args.lowering_id:
    lowering_uid = getLoweringUid(args.lowering_id)
    if not lowering_uid == None:
      logger.debug("Lowering UID: " + lowering_uid)
      framegrabs = getFramegrabListByLoweringUid(lowering_uid)
      if not framegrabs == None:
        print('\n'.join(framegrabs))
      else:
        logger.error("No framegrabs found for lowering_id: " + args.lowering_id)
    else:
      logger.error("No lowering found for lowering_id: " + args.lowering_id)
  elif args.cruise_id:
    cruise_uid = getCruiseUid(args.cruise_id)
    if not cruise_uid == None:
      logger.debug("Cruise UID: " + cruise_uid)
      framegrabs = getFramegrabListByCruiseUid(cruise_uid)
      if not framegrabs == None:
        print('\n'.join(framegrabs))
      else:
        logger.error("No framegrabs found for cruise_id: " + args.cruise_id)
    else:
      logger.error("No cruise found for cruise_id: " + args.cruise_id)
  elif args.aux_data_file:
    if os.path.isfile(args.aux_data_file):
      framegrabs = getFramegrabListByFile(args.aux_data_file)
      if not framegrabs == None:
        print('\n'.join(framegrabs))
      else:
        logger.error("No framegrabs found within file: " + args.aux_data_file)
    else:
      logger.error("File: " + args.aux_data_file + " does not exist.")
  else:
    logger.error("Must define either a cruise_id, lowering_id or aux data filename")
