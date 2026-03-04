#!/usr/bin/env python3
'''
FILE:           delete_files_aux_data_file_cleaner.py

DESCRIPTION:    Cleans up the files created by the aux data creation process.

BUGS:
NOTES:
AUTHOR:     Lindsey Jones
COMPANY:    OET
VERSION:    1.0
CREATED:    2026-02-20
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''
import sys
import os

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.aux_data_file_cleaners.base_aux_data_file_cleaner import AuxDataFileCleaner


class DeleteFilesAuxDataFileCleaner(AuxDataFileCleaner):
    '''
    Cleans up the files created by the stillcap_ffmpeg aux data creation process
    '''

    def open_connections(self):
        '''
        No connections to open.
        '''

    def close_connections(self):
        '''
        No connections to close.
        '''

    def clean_aux_data_record(self, event, dry_run):
        '''
        Do any clean up required for the given event

        Args:
            event (dict): Event dictionary containing 'id' and 'ts' keys
            dry_run (bool): If True, do not actually delete any aux data records

        Returns:
            str or None: ID of cleaned aux data record, if there is one
        '''
        aux_data = self._get_aux_data_for_source(event)

        if not aux_data:
            return None
            
        file_paths = [
                data["data_value"]
                for data in aux_data["data_array"]
                if data["data_name"] == "filename"
                ]
        for file_path in file_paths:
            try:
                self.logger.debug(f"Deleting file {file_path} for event {event['id']}")
                if not dry_run:
                    os.remove(file_path)
            except Exception as e:  # pylint: disable=W0718
                self.logger.error(
                        f"Error deleting file {file_path} for event {event['id']}: {e}"
                        )

        return aux_data["_id"]
