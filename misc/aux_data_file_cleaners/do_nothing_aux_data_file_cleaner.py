#!/usr/bin/env python3
'''
FILE:           do_nothing_aux_data_file_cleaner.py

DESCRIPTION:    Aux data file cleaner for aux data inserters that don't make any external changes.

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

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.aux_data_file_cleaners.base_aux_data_file_cleaner import AuxDataFileCleaner


class DoNothingAuxDataFileCleaner(AuxDataFileCleaner):
    '''
    Aux data file cleaner for aux data inserters that don't make any external changes.
    '''

    def open_connections(self):
        '''
        No connections to open.
        '''

    def close_connections(self):
        '''
        No connections to close.
        '''

    def clean_aux_data_record(self, event, dry_run):  # pylint: disable=W0613
        '''
        Do any clean up required for the given event

        Args:
            event (dict): Event dictionary containing 'id' and 'ts' keys
            dry_run (bool): If True, do not actually delete any aux data records

        Returns:
            str or None: ID of cleaned aux data record, if there is one
        '''
        aux_data = self._get_aux_data_for_source(event)

        if aux_data:
            self.logger.debug(
                    f"No additional clean up required for event {event['id']} {self._data_source} "
                    "aux data records"
                    )
            return aux_data["_id"]

        return None
