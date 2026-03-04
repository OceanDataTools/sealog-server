#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_test_images.py

DESCRIPTION:    This script generates test images and uses them to build a sealog aux_data record.
'''
import os
import sys
import logging
from datetime import datetime, timedelta

try:
    from paramiko import RSAKey, SFTPClient, Transport  # noqa:F401 pylint:disable=W0611
    from paramiko.sftp import SFTPError  # noqa:F401 pylint:disable=W0611
    PARAMIKO_ENABLED = True
except ImportError:
    PARAMIKO_ENABLED = False

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.framegrab_aux.settings import SOURCE_DIR, DEST_DIR, SOURCES, THRESHOLD, \
    HOST, USER, KEY_FILE, PORT

class FramegrabSCPAuxDataRecordBuilder(AuxDataRecordBuilder):  # pylint: disable=too-few-public-methods
    '''
    Class that handles generating test images and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self,
                 aux_data_config):
        super().__init__(aux_data_config)
        if not PARAMIKO_ENABLED:
            raise ModuleNotFoundError(
                'paramiko module is not installed. Try "pip3 install paramiko" prior to use.'
            )
        self._host = HOST
        self._user = USER
        self._key = RSAKey.from_private_key_file(KEY_FILE)
        self._port = PORT
        
        self._scp_transport = None
        self._sftp_client = None

    @staticmethod
    def _build_query_range(ts):
        # see, this is making me feel like this shouldn't be in the base class
        raise NotImplementedError("No query for framegrab")

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        Must be implemented by subclasses.
        '''
        self._scp_transport = Transport(self._host, self._port)
        self._scp_transport.connect(username=self._user, pkey=self._key)
        self._scp_transport.set_keepalive(30)
        # since opening connection higher up, set keepalive to prevent going stale
        logging.info("Opening SFTP connection")
        self._sftp_client = SFTPClient.from_transport(self._scp_transport)
        pass
    
    def close_connections(self):
        '''
        Close any open connections to external data sources.
        Must be implemented by subclasses.
        '''
        try:
            self._scp_transport.close()
        except Exception as err:  # pylint: disable=W0718
            logging.error("Error closing SCP Transport: %s", str(err))
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
                latest_file = os.path.join(SOURCE_DIR, source['source_filename'])
                src = os.path.join(SOURCE_DIR, latest_file)
                self._sftp_client.put(src, dst)
            except SFTPError as exc:
                logging.error("Unable to copy image to server")
                logging.error(exc)
            except OSError as exc:
                logging.error("Unable to copy image to server")
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
