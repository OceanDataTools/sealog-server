#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder_framegrab_http.py

DESCRIPTION:    This script builds a sealog aux_data record by fetching frame grab images from
                an HTTP source.
'''
import shutil
import sys

import requests

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.framegrab_aux.aux_data_record_builder_framegrab_base import (
    FramegrabBaseAuxDataRecordBuilder
)


class FramegrabHTTPAuxDataRecordBuilder(FramegrabBaseAuxDataRecordBuilder):  # pylint:disable=R0903
    '''
    Builds a sealog aux_data record by fetching frame grab images from an HTTP source.
    '''

    def _fetch_image(self, source, dst):
        '''
        Download the image from the HTTP source and write it to dst.
        Returns False if the request fails, True otherwise.
        '''
        try:
            res = requests.get(
                source['source_url'] + source['source_filename'],
                stream=True,
                timeout=(2, None)
            )

            if res.status_code != 200:
                self.logger.error(
                    "Unable to retrieve image from: %s",
                    source['source_url'] + source['source_filename']
                )
                return False

        except requests.exceptions.RequestException as exc:
            self.logger.error("Unable to retrieve image from remote server")
            self.logger.error(exc)
            return False

        try:
            with open(dst, 'wb') as f:
                shutil.copyfileobj(res.raw, f)

        except shutil.Error as exc:
            self.logger.error("Unable to save image to server")
            self.logger.error(exc)

        return True
