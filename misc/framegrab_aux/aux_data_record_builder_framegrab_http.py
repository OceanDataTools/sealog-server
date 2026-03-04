#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_test_images.py

DESCRIPTION:    This script generates test images and uses them to build a sealog aux_data record.
'''
import os
import sys
import logging
from datetime import datetime, timedelta
import requests
import shutil

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.framegrab_aux.settings import DEST_DIR, SOURCES, THRESHOLD

class FramegrabHTTPAuxDataRecordBuilder(AuxDataRecordBuilder):  # pylint: disable=too-few-public-methods
    '''
    Class that handles generating test images and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self,
                 aux_data_config):
        super().__init__(aux_data_config)

    @staticmethod
    def _build_query_range(ts):
        # see, this is making me feel like this shouldn't be in the base class
        raise NotImplementedError("No query for framegrab")

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        Must be implemented by subclasses.
        '''
        pass
    
    def close_connections(self):
        '''
        Close any open connections to external data sources.
        Must be implemented by subclasses.
        '''
        pass
    
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
            logging.debug("Skipping because event ts is older than thresold")
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

            logging.debug("dst: %s", dst)

            try:
                res = requests.get(
                    source['source_url'] + source['source_filename'],
                    stream=True,
                    timeout=(2, None)
                )

                if res.status_code != 200:
                    logging.error(
                        "Unable to retrieve image from: %s",
                        source['source_url'] + source['source_filename']
                    )
                    continue

            except requests.exceptions.RequestException as exc:
                logging.error("Unable to retrieve image from remote server")
                logging.error(exc)

            try:
                with open(dst, 'wb') as f:
                    shutil.copyfileobj(res.raw, f)

            except shutil.Error as exc:
                logging.error("Unable to save image to server")
                logging.error(exc)

            aux_data_record['data_array'].append(
                {'data_name': "camera_name", 'data_value': source['source_name']}
            )
            aux_data_record['data_array'].append(
                {'data_name': "filename", 'data_value': dst}
            )

        if len(aux_data_record['data_array']) > 0:
            return aux_data_record
        return None
