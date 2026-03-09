#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_framegrab_local.py

DESCRIPTION:    This script builds a sealog aux_data record by copying frame grab images from a
                local directory.
'''
import os
import shutil
import sys

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.framegrab_aux.aux_data_record_builder_framegrab_base import (
    FramegrabBaseAuxDataRecordBuilder
)
from misc.framegrab_aux.settings import SOURCE_DIR


class FramegrabLocalAuxDataRecordBuilder(FramegrabBaseAuxDataRecordBuilder):  # pylint:disable=R0903
    '''
    Builds a sealog aux_data record by copying frame grab images from a local directory.
    '''

    def _fetch_image(self, source, dst):
        '''
        Copy the image from the local source directory to dst.
        Always returns True; errors are logged but do not skip the record entry.
        '''
        latest_file = os.path.join(SOURCE_DIR, source['source_filename'])
        src = os.path.join(SOURCE_DIR, latest_file)
        try:
            shutil.copyfile(src, dst)

        except shutil.Error as exc:
            self.logger.error("Unable to save image to server")
            self.logger.error(exc)
            return False

        return True
