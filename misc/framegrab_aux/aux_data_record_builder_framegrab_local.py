#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_framegrab_local.py

DESCRIPTION:    This script builds a sealog aux_data record by copying frame grab images from local directory.
'''
import os
import shutil
import sys

from datetime import datetime, timedelta
from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.framegrab_aux.settings import SOURCE_DIR, DEST_DIR, SOURCES, THRESHOLD


class FramegrabLocalAuxDataRecordBuilder(AuxDataRecordBuilder):
    '''
    Class that handles generating test images and using the
    resulting data to build a sealog aux_data record.
    '''

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        Must be implemented by subclasses.
        '''

    def close_connections(self):
        '''
        Close any open connections to external data sources.
        Must be implemented by subclasses.
        '''

    def _build_destination_filepath(self, str_timestamp, filename_prefix, filename_suffix):
        timestamp = datetime.strptime(
            str_timestamp,
            '%Y-%m-%dT%H:%M:%S.%fZ'
        )
        filename_date = datetime.date(timestamp)
        filename_time = datetime.time(timestamp)
        filename_middle = datetime.combine(
            filename_date, filename_time
        ).strftime("%Y%m%d_%H%M%S%f")[:-3]

        destination_filepath = os.path.join(
            DEST_DIR,
            filename_prefix + filename_middle + filename_suffix
        )

        return destination_filepath

    def build_aux_data_record(self, event):
        '''
        Build the aux_data record for the given event.
        '''
        if datetime.strptime(
            event['ts'],
            '%Y-%m-%dT%H:%M:%S.%fZ'
        ) < datetime.utcnow()-timedelta(seconds=THRESHOLD):
            self.logger.debug("Skipping because event ts is older than thresold")
            return None

        aux_data_record = {
            'event_id': event['id'],
            'data_source': self._data_source,
            'data_array': []
        }

        for source in SOURCES:

            dst = self._build_destination_filepath(
                event['ts'],
                source['filename_prefix'],
                source['filename_suffix']
            )

            self.logger.debug("dst: %s", dst)

            latest_file = os.path.join(SOURCE_DIR, source['source_filename'])
            src = os.path.join(SOURCE_DIR, latest_file)
            try:
                shutil.copyfile(src, dst)

            except shutil.Error as exc:
                self.logger.error("Unable to save image to server")
                self.logger.error(exc)

            aux_data_record['data_array'].append(
                {'data_name': "camera_name", 'data_value': source['source_name']}
            )
            aux_data_record['data_array'].append(
                {'data_name': "filename", 'data_value': dst}
            )

        if len(aux_data_record['data_array']) > 0:
            return aux_data_record
        return None
