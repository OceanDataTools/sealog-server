#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder.py

DESCRIPTION:    This script builds a sealog aux_data record with data pulled from an
                influx database.

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

from misc.coriolix_sealog.settings import CORIOLIX_URL


class SealogCORIOLIXAuxDataRecordBuilder():
    '''
    Class that handles the construction of an influxDB query and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self, aux_data_config, url=None):
        self.url = url or CORIOLIX_URL
        self._query_measurements = aux_data_config['query_measurements']
        self._query_fields = list(aux_data_config['aux_record_lookup'].keys())
        self._aux_record_lookup = aux_data_config['aux_record_lookup']
        self._data_source = aux_data_config['data_source']
        self.logger = logging.getLogger(__name__)

    @staticmethod
    def _build_query_range(ts):  # pylint: disable=invalid-name
        '''
        Builds the temporal range for the influxDB query based on the provided
        timestamp (ts).
        '''
        try:
            start_ts = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(minutes=1)
            return f'date_after={quote(start_ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ"))}&date_before={quote(ts)}'
        except ValueError as exc:
            logging.debug(str(exc))
            return None

    def _build_query_urls(self, ts):  # pylint: disable=invalid-name
        '''
        Builds the complete influxDB query using the provided timestamp (ts)
        and the class instance's query_measurements and query_fields values.
        '''

        query_range = self._build_query_range(ts)

        query_urls = []

        for measurement in self._query_measurements:    
            query_urls.append(f'{self.url}/api/{measurement}/?{query_range}')
            logging.debug("Query: %s", f'{self.url}/{measurement}/?{query_range}')

        return query_urls

    def _build_aux_data_dict(self, event_id, query_results):  # pylint: disable=too-many-branches
        '''
        Internal method to build the sealog aux_data record using the event_id,
        query_results and the class instance's datasource value.
        '''

        aux_data_record = {
            'event_id': event_id,
            'data_source': self._data_source,
            'data_array': []
        }

        coriolix_data = query_results

        logging.debug("raw values: %s", json.dumps(coriolix_data, indent=2))

        if not coriolix_data:
            return None

        for key, value in self._aux_record_lookup.items():  # pylint: disable=too-many-nested-blocks
            try:
                if "no_output" in value and value['no_output'] is True:
                    continue

                if key not in coriolix_data:
                    continue

                output_value = coriolix_data[key]

                if "modify" in value:
                    logging.debug("modify found in record")
                    for mod_op in value['modify']:
                        test_result = True

                        if 'test' in mod_op:
                            logging.debug("test found in mod_op")
                            test_result = False

                            for test in mod_op['test']:
                                logging.debug(json.dumps(test))

                                if 'field' in test:

                                    if test['field'] not in coriolix_data:
                                        logging.error("test field data not in CORIOLIX query")
                                        return None

                                    if 'eq' in test and coriolix_data[test['field']] == test['eq']:
                                        test_result = True
                                        break

                                    if 'gt' in test and coriolix_data[test['field']] > test['gt']:
                                        test_result = True
                                        break

                                    if 'gte' in test and coriolix_data[test['field']] >= test['gt']:
                                        test_result = True
                                        break

                                    if 'lt' in test and coriolix_data[test['field']] < test['lt']:
                                        test_result = True
                                        break

                                    if 'lte' in test and coriolix_data[test['field']] <= test['lt']:
                                        test_result = True
                                        break

                                    if 'ne' in test and coriolix_data[test['field']] != test['ne']:
                                        test_result = True
                                        break

                        if test_result and 'operation' in mod_op:
                            logging.debug("operation found in mod_op")
                            for operan in mod_op['operation']:

                                if 'add' in operan:
                                    output_value += operan['add']

                                if 'subtract' in operan:
                                    output_value -= operan['subtract']

                                if 'multiply' in operan:
                                    output_value *= operan['multiply']

                                if 'divide' in operan:
                                    output_value /= operan['divide']

                aux_data_record['data_array'].append({
                    'data_name': value['name'],
                    'data_value': str(round(output_value, value['round'])) if 'round' in value else str(output_value),
                    'data_uom': value['uom'] if 'uom' in value else ''
                })
            except ValueError as exc:
                logging.warning("Problem adding %s", key)
                logging.debug(str(exc))
                continue

        if len(aux_data_record['data_array']) > 0:
            return aux_data_record

        return None

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
            logging.warning(measurement)
            # run the query against the influxDB
            try:
                response = requests.get(url)

                if response.status_code != 200:
                    logging.error(f"Failed to retrieve data. Status code: {response.status_code}")

                response_obj = response.json()
                if len(response_obj):
                    query_results = {**query_results, **{f"{measurement}__{key}": value for key, value in response_obj[-1].items() if f'{measurement}__{key}' in self._query_fields}}

            except NewConnectionError:
                logging.error("CORIOLIX connection error, verify URL: %s", self.url)

            except Exception as exc:
                logging.error("Error with query:")
                logging.error(url)
                logging.error(str(exc))

        aux_data_record = self._build_aux_data_dict(event['id'], query_results)
        return aux_data_record

    @property
    def data_source(self):
        '''
        Getter method for the data_source property
        '''
        return self._data_source

    @property
    def measurements(self):
        '''
        Getter method for the _query_measurements property
        '''
        return self._query_measurements

    @property
    def fields(self):
        '''
        Getter method for the _query_fields property
        '''
        return self._query_fields

    @property
    def record_lookup(self):
        '''
        Getter method for the _aux_record_lookup property
        '''
        return self._aux_record_lookup
