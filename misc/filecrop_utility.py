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
                Copyright (C) OceanDataTools.org 2025
'''

import os
import logging
from datetime import datetime
from collections import defaultdict


class FileCropUtility():  # pylint:disable=R0902
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
        self._header_str = None
        self._error_counts = defaultdict(lambda: defaultdict(int))
        self._current_file = None

    @property
    def header_str(self):
        '''Getter for the captured header string.'''
        return self._header_str

    def _log_error(self, message, filename, details=None):
        """Track error occurrences and log first instance with details"""
        basename = os.path.basename(filename)
        self._error_counts[basename][message] += 1
        count = self._error_counts[basename][message]

        # Only log the first occurrence with details
        if count == 1:
            if details:
                logging.warning("%s in %s: %s", message, basename, details)
            else:
                logging.warning("%s in %s", message, basename)

    def _report_errors(self):
        """Report accumulated errors if any"""
        for filename, errors in self._error_counts.items():
            for message, count in errors.items():
                if count > 1:
                    logging.warning("%s occurred %d times in %s", message, count, filename)
        # Clear counts after reporting
        self._error_counts.clear()

    def cull_files(self, data_files):  # pylint:disable=R0915
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
            self._current_file = data_file
            logging.debug("File: %s", data_file)
            with open(data_file, 'rb') as file:

                if self.header:
                    self._header_str = file.readline().decode()

                # Read lines until we get a non-empty one, or hit EOF
                first_line = ''
                while True:
                    raw_line = file.readline()
                    if not raw_line:  # EOF
                        break

                    first_line = raw_line.decode().strip()
                    if first_line:  # If line is not empty
                        break

                if not first_line:
                    self._log_error("No valid data found", data_file)
                    continue

                try:
                    first_ts = datetime.strptime(
                        first_line.split(self.delimiter)[0], self.dt_format
                    )

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
                logging.info('lastline: %s', last_line)
                # Hack to deal with extra newline characters in data files.
                if last_line == '':
                    file.seek(-4, os.SEEK_CUR)
                    while file.read(1) != b'\n':
                        file.seek(-2, os.SEEK_CUR)

                    last_line = file.readline().decode().rstrip('\n')
                    logging.info('lastline hack: %s', last_line)
                # End of hack

                try:
                    last_ts = datetime.strptime(last_line.split(self.delimiter)[0], self.dt_format)
                except ValueError as exc:
                    logging.warning("Could not process last line in %s: %s", data_file, last_line)
                    logging.debug(str(exc))
                    continue

                logging.debug("    Last line: %s", last_line)
                logging.debug("    Last timestamp: %s", last_ts)

            if not (
                (self.start_dt - last_ts).total_seconds() > 0
                or (first_ts - self.stop_dt).total_seconds() > 0
            ):
                logging.debug("    ** Include this file **")
                culled_files.append(data_file)

        self._report_errors()  # Report errors after processing all files
        logging.debug("Culled file list: \n\t%s", '\n\t'.join(culled_files))
        return culled_files

    def crop_file_data(self, data_files):
        '''
        Read the file(s) and return on the data from between the start/stop
        timestamps.
        '''

        logging.info("Cropping file data")
        header_sent = False

        if not isinstance(data_files, list):
            data_files = [data_files]

        for data_file in data_files:
            logging.debug("File: %s", data_file)
            with open(data_file, 'r', encoding='utf-8') as file:

                # consume the source file's header line so it isn't parsed as data
                if self.header:
                    header_line = file.readline()

                    if not header_sent:
                        header_sent = True
                        yield self._header_str or header_line

                while True:

                    line_str = file.readline()

                    if not line_str:
                        break

                    try:
                        line_ts = datetime.strptime(
                            line_str.split(self.delimiter)[0], self.dt_format
                        )

                    except ValueError as exc:
                        logging.warning("Could not process line: %s", line_str)
                        logging.debug(str(exc))

                    else:
                        if (
                            (line_ts - self.start_dt).total_seconds() >= 0 and
                            (self.stop_dt - line_ts).total_seconds() >= 0
                        ):
                            yield line_str
