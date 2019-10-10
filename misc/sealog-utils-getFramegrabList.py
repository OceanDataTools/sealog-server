#!/usr/bin/env python3
import os
import logging
import python_sealog
from python_sealog.misc import getFramegrabListByLoweringUid, getFramegrabListByFile
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
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# add formatter to ch
ch.setFormatter(formatter)

# add ch to logger
logger.addHandler(ch)

if __name__ == '__main__':

  import argparse

  parser = argparse.ArgumentParser(description='Retrieve list of framegrab files by Lowering ID')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('-l', '--lowering', help='lowering ID i.e. "J2-1111".')
  parser.add_argument('-f', '--aux_data_file', help='aux_data_file.')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  if args.lowering:
    lowering_id = getLoweringUid(args.lowering)
    if not lowering_id == None:
      logger.debug("Logger UID: " + lowering_id)
      print('\n'.join(getFramegrabListByLoweringUid(lowering_id)))
  elif args.aux_data_file and os.path.isfile(args.aux_data_file):
      print('\n'.join(getFramegrabListByFile(args.aux_data_file)))
