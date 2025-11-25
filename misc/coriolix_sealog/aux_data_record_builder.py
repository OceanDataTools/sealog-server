#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder.py

DESCRIPTION:    This script builds a sealog aux_data record with data pulled from a
                CORIOLIX API.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2025-02-08
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''
import os
import sys
import json
import logging
import requests
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse
from urllib3.exceptions import NewConnectionError

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.coriolix_sealog.settings import CORIOLIX_URL


class SealogCORIOLIXAuxDataRecordBuilder(AuxDataRecordBuilder):
    '''
    Class that handles the construction of CORIOLIX API queries and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self, aux_data_config, url=None):
        super().__init__(aux_data_config)
        self.url = url or CORIOLIX_URL

    @staticmethod
    def _build_query_range(ts):
        '''
        Builds the temporal range for the CORIOLIX query based on the provided
        timestamp (ts).
        '''
        try:
            start_ts = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(minutes=1)

            return (f'date_after={quote(start_ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"))}'
                    f'&date_before={quote(ts)}')

        except ValueError as exc:
            logging.debug(str(exc))
            return None

    def _build_query_urls(self, ts):
        '''
        Builds the CORIOLIX API URLs using the provided timestamp (ts)
        and the class instance's query_measurements and query_fields values.
        '''

        query_range = self._build_query_range(ts)

        query_urls = []

        for measurement in self._query_measurements:
            query_urls.append(f'{self.url}/api/{measurement}/?format=json&{query_range}')
            logging.debug("Query: %s", query_urls[-1])

        return query_urls

    def build_aux_data_record(self, event):
        '''
        Build the aux_data record for the given event.
        '''

        logging.debug("building query")
        query_urls = self._build_query_urls(event['ts'])

        query_results = {}

        for url in query_urls:
            logging.debug("Query URL: %s", url)
            measurement = os.path.basename(urlparse(url).path.strip('/'))

            # run the query against the CORIOLIX API
            try:
                response = requests.get(url, timeout=2)
                if response.status_code != 200:
                    logging.error("Failed to retrieve data. Status code: %s", response.status_code)

                response_obj = json.loads(response.text)
                if isinstance(response_obj, dict):
                    response_obj = response_obj.get('results', [])

                if len(response_obj):
                    query_results = {
                        **query_results,
                        **{f"{measurement}__{key}": value
                            for key, value in response_obj[-1].items()
                            if f'{measurement}__{key}' in self._query_fields}
                    }

            except NewConnectionError:
                logging.error("CORIOLIX connection error, verify URL: %s", self.url)

            except json.decoder.JSONDecodeError:
                logging.error("Unable to decode response from URL: %s", url)
                logging.debug(response)
            except KeyError:
                logging.error("Something went wrong processing the API response")

        aux_data_record = self._build_aux_data_dict(event['id'], query_results)
        return aux_data_record