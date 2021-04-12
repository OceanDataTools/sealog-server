import os
import glob
import logging
from datetime import datetime, timezone

class FileCropUtility():

  def __init__(self, start_dt=datetime(1970, 1, 1, 0, 0, 0, tzinfo=None), stop_dt=datetime.utcnow(), delimiter=',', dt_format='%Y-%m-%dT%H:%M:%S.%fZ'):
    self.start_dt = start_dt
    self.stop_dt = stop_dt
    self.delimiter = delimiter
    self.dt_format = dt_format
    self.logger = logging.getLogger('FileCropUtility')

  def getLogger(self):
    return self.logger

  def cull_files(self, files):

    if not type(files) is list:
      files = [files]

    self.logger.info("Culling file list")
    culled_files = []

    for file in files:
      self.logger.debug("File: {}".format(file))
      with open( file, 'rb' ) as f :
        first_line = f.readline().decode().rstrip('\n')
        try:
          first_ts = datetime.strptime(first_line.split(self.delimiter)[0],self.dt_format)

        except:
          self.logger.warning("Could not process first line in {}: {}".format(file, first_line))
          continue

        self.logger.debug("  First line: {}".format(first_line))
        self.logger.debug("  First timestamp: {}".format(first_ts))

        f.seek(-2, os.SEEK_END)
        while f.read(1) != b'\n':
          f.seek(-2, os.SEEK_CUR)

        last_line = f.readline().decode().rstrip('\n')

        try:
          last_ts = datetime.strptime(last_line.split(self.delimiter)[0],self.dt_format)
        except:
          self.logger.warning("Could not process last line in {}: {}".format(file, last_line))
          continue

        self.logger.debug("  Last line: {}".format(last_line))
        self.logger.debug("  Last timestamp: {}".format(last_ts))

      if not ((self.start_dt - last_ts).total_seconds() > 0 or (first_ts - self.stop_dt).total_seconds() > 0):
        self.logger.debug("  ** Include this file **")
        culled_files.append(file)

    self.logger.debug("Culled file list: {}".format(', '.join(culled_files)))  
    return culled_files

  def crop_file_data(self, files):

    self.logger.info("Cropping file data")

    if not type(files) is list:
      files = [files]

    for file in files:
      self.logger.debug("File: {}".format(file))
      with open( file, 'r' ) as file_object :
        while True:
          line_str = file_object.readline()

          if not line_str:
            break

          try:
            line_ts = datetime.strptime(line_str.split(self.delimiter)[0],self.dt_format)

          except:
            self.logger.warning("Could not process line: {}".format(line_str))

          else:

            if (line_ts - self.start_dt).total_seconds() >= 0 and (self.stop_dt - line_ts).total_seconds() >= 0:
              yield line_str