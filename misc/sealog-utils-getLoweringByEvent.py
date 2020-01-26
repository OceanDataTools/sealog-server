#!/usr/bin/env python3

import logging
import python_sealog
from python_sealog.lowerings import getLoweringByEvent
from python_sealog.events import getEvent

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

  parser = argparse.ArgumentParser(description='Retrieve Lowering from Event UID')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('event_uid', help='Event UID i.e. "5981f167212b348aed7fa9ff".')

  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)
    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)
    logger.debug("Log level now set to DEBUG")

  event = getEvent(args.event_uid)

  if not event:
    logger.error("No event found for event_uid: " + args.event_uid)

  else:
    lowering = getLoweringByEvent(args.event_uid)
    if lowering != None:
      print(lowering)
    else:
      logger.error("No lowering found for event_uid: " + args.event_uid)