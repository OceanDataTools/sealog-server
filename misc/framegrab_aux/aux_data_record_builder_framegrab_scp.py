#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_framegrab_scp.py

DESCRIPTION:    This script builds a sealog aux_data record by transferring frame grab images
                via SCP.
'''
import os
import sys

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

try:
    from paramiko import RSAKey, SFTPClient, Transport  # noqa:F401 pylint:disable=W0611
    from paramiko.sftp import SFTPError  # noqa:F401 pylint:disable=W0611
    PARAMIKO_ENABLED = True
except ImportError:
    PARAMIKO_ENABLED = False

from misc.framegrab_aux.aux_data_record_builder_framegrab_base import (
    FramegrabBaseAuxDataRecordBuilder
)
from misc.framegrab_aux.settings import SOURCE_DIR, HOST, USER, KEY_FILE, PORT


class FramegrabSCPAuxDataRecordBuilder(FramegrabBaseAuxDataRecordBuilder):
    '''
    Builds a sealog aux_data record by transferring frame grab images via SCP.
    '''

    def __init__(self, aux_data_config):
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

    def open_connections(self):
        '''
        Open the SFTP connection to the remote host.
        '''
        self._scp_transport = Transport(self._host, self._port)
        self._scp_transport.connect(username=self._user, pkey=self._key)
        self._scp_transport.set_keepalive(30)
        self.logger.info("Opening SFTP connection")
        self._sftp_client = SFTPClient.from_transport(self._scp_transport)

    def close_connections(self):
        '''
        Close the SFTP connection.
        '''
        try:
            self._scp_transport.close()
        except Exception as err:  # pylint: disable=W0718
            self.logger.error("Error closing SCP Transport: %s", str(err))

    def _fetch_image(self, source, dst):
        '''
        Transfer the image from the remote source to dst via SFTP.
        Always returns True; errors are logged but do not skip the record entry.
        '''
        try:
            latest_file = os.path.join(SOURCE_DIR, source['source_filename'])
            src = os.path.join(SOURCE_DIR, latest_file)
            self._sftp_client.put(src, dst)
        except SFTPError as exc:
            self.logger.error("Unable to copy image to server")
            self.logger.error(exc)
            return False
        except OSError as exc:
            self.logger.error("Unable to copy image to server")
            self.logger.error(exc)
            return False

        return True
