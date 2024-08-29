#!/usr/bin/env python3
'''
FILE:           filecrop_utility.py

DESCRIPTION:    This class handles culling subsets of data from files based on
                start/stop times.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-04-21
REVISION:   2021-04-27

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

import os
import logging
from datetime import datetime


class FileCropUtility():
    '''
    This class handles culling subsets of data from files based on start/stop
    times.
    '''

    def __init__(self,
                 start_dt=datetime(1970, 1, 1, 0, 0, 0, tzinfo=None),
                 stop_dt=datetime.utcnow(),
                 delimiter=',',
                 dt_format='%Y-%m-%dT%H:%M:%S.%fZ',
                 header=False):
        self.start_dt = start_dt
        self.stop_dt = stop_dt
        self.delimiter = delimiter
        self.dt_format = dt_format
        self.header = header

    def cull_files(self, data_files):
        '''
        Peek at the first/last entries in the file(s) and return only the files
        that contain data between the start/stop timestamps.
        '''

        if not isinstance(data_files, list):
            data_files = [data_files]

        culled_files = []

        logging.info("Culling file list")
        if len(data_files) == 0:
            logging.info("    No files found.")
            return culled_files

        for data_file in data_files:
            logging.debug("File: %s", data_file)
            with open(data_file, 'rb') as file:

                if self.header:
                    _ = file.readline()

                first_line = file.readline().decode().rstrip('\n')
                try:
                    first_ts = datetime.strptime(first_line.split(self.delimiter)[0], self.dt_format)

                except ValueError as exc:
                    logging.warning("Could not process first line in %s: %s", data_file, first_line)
                    logging.debug(str(exc))
                    continue

                logging.debug("    First line: %s", first_line)
                logging.debug("    First timestamp: %s", first_ts)

                file.seek(-2, os.SEEK_END)
                while file.read(1) != b'\n':
                    file.seek(-2, os.SEEK_CUR)

                last_line = file.readline().decode().rstrip('\n')

                try:
                    last_ts = datetime.strptime(last_line.split(self.delimiter)[0], self.dt_format)
                except ValueError as exc:
                    logging.warning("Could not process last line in %s: %s", data_file, last_line)
                    logging.debug(str(exc))
                    continue

                logging.debug("    Last line: %s", last_line)
                logging.debug("    Last timestamp: %s", last_ts)

            if not ((self.start_dt - last_ts).total_seconds() > 0 or (first_ts - self.stop_dt).total_seconds() > 0):
                logging.debug("    ** Include this file **")
                culled_files.append(data_file)

        logging.debug("Culled file list: \n\t%s", '\n\t'.join(culled_files))
        return culled_files

    def crop_file_data(self, data_files):
        '''
        Read the file(s) and return on the data from between the start/stop
        timestamps.
        '''

        logging.info("Cropping file data")

        if not isinstance(data_files, list):
            data_files = [data_files]

        for data_file in data_files:
            logging.debug("File: %s", data_file)
            with open(data_file, 'r', encoding='utf-8') as file:
                while True:
                    line_str = file.readline()

                    if not line_str:
                        break

                    try:
                        line_ts = datetime.strptime(line_str.split(self.delimiter)[0], self.dt_format)

                    except ValueError as exc:
                        logging.warning("Could not process line: %s", line_str)
                        logging.debug(str(exc))

                    else:
                        if (line_ts - self.start_dt).total_seconds() >= 0 and (self.stop_dt - line_ts).total_seconds() >= 0:
                            yield line_str
