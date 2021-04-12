#!/usr/bin/env python3

import os
import glob
import logging
from filecroputility import FileCropUtility
from datetime import datetime, timezone
from python_sealog.lowerings import getLoweringByID

LOG_LEVELS = {0:logging.WARNING, 1:logging.INFO, 2:logging.DEBUG}



# create formatter
formatter = logging.Formatter('%(levelname)s - %(message)s')

def is_valid_file(parser, file):
  if not os.path.exists(file):
    parser.error("The file %s does not exist!" % file)
  else:
    return file

def is_valid_dir(parser, file):
  if not os.path.exists(os.path.dirname(file)):
    parser.error("The destination directory %s does not exist!" % os.path.dirname(file))
  else:
    return file

def is_valid_loweringID(parser, loweringID):
  lowering = getLoweringByID(loweringID)
  if not lowering:
    parser.error("The lowering %s does not exist!" % loweringID)
  else:
    return lowering


if __name__ == '__main__':

  import sys
  import argparse

  parser = argparse.ArgumentParser(description='Crop by lowering')
  parser.add_argument('-v', '--verbosity',
                      dest='verbosity',
                      default=0,
                      action='count',
                      help='Increase output verbosity')
  parser.add_argument('-o', '--output_file',
                      type=lambda o: is_valid_dir(parser, o),
                      help='Output file path for cropped output')
  parser.add_argument('-d', '--delimiter',
                      default=',',
                      help='String delimiter, default is ",".')
  parser.add_argument('-t', '--ts_format',
                      default='%Y-%m-%dT%H:%M:%S.%fZ',
                      help='Format of timestring in file, default is: YYYY-mm-ddTHH:MM:SS.fffZ')
  parser.add_argument('lowering',
                      type=lambda lowering: is_valid_loweringID(parser, lowering),
                      help='LoweringID, i.e. CHR0019')
  parser.add_argument('input_files',
                      type=lambda file: is_valid_file(parser, file),
                      nargs='+',
                      help='Input files or glob string i.e. ./GGA_*.txt')

  args = parser.parse_args()

  ############################
  # Set up logging before we do any other argument parsing (so that we
  # can log problems with argument parsing).
  log_level = LOG_LEVELS[min(args.verbosity, max(LOG_LEVELS))]
  logging.getLogger().setLevel(log_level)

  ch = logging.StreamHandler()
  ch.setFormatter(formatter)
  logging.root.handlers = [ch]

  logging.debug("Files:\n\t{}".format("\n\t".join(args.input_files)))

  # Run the main loop
  try:
    fcu = FileCropUtility(datetime.strptime(args.lowering['start_ts'], '%Y-%m-%dT%H:%M:%S.%fZ'), datetime.strptime(args.lowering['stop_ts'], '%Y-%m-%dT%H:%M:%S.%fZ'), args.delimiter, args.ts_format)
    fcu.getLogger().setLevel(log_level)

    culled_files = fcu.cull_files(args.input_files)
    if len(culled_files) > 0:
      if args.output_file:
        with open(args.output_file, 'w') as f:
          for line in fcu.crop_file_data(culled_files):
            f.write(line)
      else:
        for line in fcu.crop_file_data(culled_files):
          print(line)
    else:
      logging.warning("No files containing data in the specified range")

  except KeyboardInterrupt:
    print('Interrupted')

    try:
      sys.exit(0)

    except SystemExit:
      os._exit(0)
