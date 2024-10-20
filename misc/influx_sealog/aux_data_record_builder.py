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
CREATED:    2021-01-01
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''
import sys
import json
import logging
from datetime import datetime, timedelta
from urllib3.exceptions import NewConnectionError
from influxdb_client.rest import ApiException

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.influx_sealog.settings import INFLUXDB_URL, INFLUXDB_AUTH_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET


class SealogInfluxAuxDataRecordBuilder():
    '''
    Class that handles the construction of an influxDB query and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self, influxdb_client, aux_data_config):
        self._influxdb_client = influxdb_client.query_api()
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
            return f'start: {start_ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}, stop: {ts}'
        except ValueError as exc:
            logging.debug(str(exc))
            return None

    def _build_query(self, ts):  # pylint: disable=invalid-name
        '''
        Builds the complete influxDB query using the provided timestamp (ts)
        and the class instance's query_measurements and query_fields values.
        '''

        query_range = self._build_query_range(ts)

        try:
            query = 'from(bucket: "{}")\n'.format(INFLUXDB_BUCKET)
            query += '|> range({})\n'.format(query_range)
            query += '|> filter(fn: (r) => {})\n'.format(' or '.join(['r["_measurement"] == "{}"'.format(q_measurement) for q_measurement in self._query_measurements]))
            query += '|> filter(fn: (r) => {})\n'.format(' or '.join(['r["_field"] == "{}"'.format(q_field) for q_field in self._query_fields]))
            query += '|> sort(columns: ["_time"], desc: true)\n'
            query += '|> limit(n:1)'
        except Exception as exc:
            logging.error("Error building query string")
            logging.error(" - Range: %s", query_range)
            logging.error(" - Measurements: %s", self._query_measurements)
            logging.error(" - Fields: %s", self._query_fields)
            raise exc

        logging.debug("Query: %s", query)
        return query

    def _build_aux_data_dict(self, event_id, influx_query_result):  # pylint: disable=too-many-branches
        '''
        Internal method to build the sealog aux_data record using the event_id,
        influx_query_result and the class instance's datasource value.
        '''

        aux_data_record = {
            'event_id': event_id,
            'data_source': self._data_source,
            'data_array': []
        }

        influx_data = {
        }

        for table in influx_query_result:
            for record in table.records:

                influx_data[record.get_field()] = record.get_value()

        logging.debug("raw values: %s", json.dumps(influx_data, indent=2))

        if not influx_data:
            return None

        for key, value in self._aux_record_lookup.items():  # pylint: disable=too-many-nested-blocks
            try:
                if "no_output" in value and value['no_output'] is True:
                    continue

                if key not in influx_data:
                    continue

                output_value = influx_data[key]

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

                                    if test['field'] not in influx_data:
                                        logging.error("test field data not in influx query")
                                        return None

                                    if 'eq' in test and influx_data[test['field']] == test['eq']:
                                        test_result = True
                                        break

                                    if 'gt' in test and influx_data[test['field']] > test['gt']:
                                        test_result = True
                                        break

                                    if 'gte' in test and influx_data[test['field']] >= test['gt']:
                                        test_result = True
                                        break

                                    if 'lt' in test and influx_data[test['field']] < test['lt']:
                                        test_result = True
                                        break

                                    if 'lte' in test and influx_data[test['field']] <= test['lt']:
                                        test_result = True
                                        break

                                    if 'ne' in test and influx_data[test['field']] != test['ne']:
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
        query = self._build_query(event['ts'])

        logging.debug("Query: %s", query)
        # run the query against the influxDB
        try:
            query_result = self._influxdb_client.query(query=query)

        except NewConnectionError:
            logging.error("InfluxDB connection error, verify URL: %s", INFLUXDB_URL)

        except ApiException as exc:
            _, value, _ = sys.exc_info()

            if str(value).startswith("(400)"):
                logging.error("InfluxDB API error, verify org: %s", INFLUXDB_ORG)
            elif str(value).startswith("(401)"):
                logging.error("InfluxDB API error, verify token: %s", INFLUXDB_AUTH_TOKEN)
            elif str(value).startswith("(404)"):
                logging.error("InfluxDB API error, verify bucket: %s", INFLUXDB_BUCKET)
            else:
                raise exc

        except Exception as exc:
            logging.error("Error with query:")
            logging.error(query.replace("|>", '\n'))
            logging.error(str(exc))

        else:
            aux_data_record = self._build_aux_data_dict(event['id'], query_result)

            return aux_data_record

        return None

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
