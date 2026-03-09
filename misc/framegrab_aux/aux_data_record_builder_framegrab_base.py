#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_framegrab_base.py

DESCRIPTION:    Base class for building sealog aux_data records from frame grab images.
                Handles common logic for threshold checking, destination filepath building,
                and aux_data record construction. Subclasses implement _fetch_image() to
                retrieve the image from their specific source.
'''
import os
import sys

from abc import abstractmethod
from datetime import datetime, timedelta
from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.framegrab_aux.settings import DEST_DIR, SOURCES, THRESHOLD


class FramegrabBaseAuxDataRecordBuilder(AuxDataRecordBuilder):
    '''
    Base class for framegrab aux_data record builders. Subclasses implement
    _fetch_image() to handle source-specific image retrieval.
    '''

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        Subclasses with persistent connections should override this method.
        '''

    def close_connections(self):
        '''
        Close any open connections to external data sources.
        Subclasses with persistent connections should override this method.
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

        return os.path.join(
            DEST_DIR,
            filename_prefix + filename_middle + filename_suffix
        )

    @abstractmethod
    def _fetch_image(self, source, dst):
        '''
        Fetch the image for the given source entry and write it to dst.
        Returns True if the image was successfully fetched and the record
        entry should be appended, False to skip this source.
        '''

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

            if not self._fetch_image(source, dst):
                continue

            aux_data_record['data_array'].append(
                {'data_name': "camera_name", 'data_value': source['source_name']}
            )
            aux_data_record['data_array'].append(
                {'data_name': "filename", 'data_value': dst}
            )

        if len(aux_data_record['data_array']) > 0:
            return aux_data_record
        return None
