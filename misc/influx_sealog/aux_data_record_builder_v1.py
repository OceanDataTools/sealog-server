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
                Copyright (C) OceanDataTools.org 2025
'''
import sys
import logging
from datetime import datetime, timedelta
from urllib3.exceptions import NewConnectionError
from influxdb.exceptions import InfluxDBClientError, InfluxDBServerError

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.influx_sealog.settings import (
    INFLUXDB_URL,
    INFLUXDB_AUTH_TOKEN,
    INFLUXDB_ORG,
    INFLUXDB_BUCKET
)


class SealogInfluxV1AuxDataRecordBuilder(AuxDataRecordBuilder):  # pylint: disable=too-few-public-methods # noqa: E501
    '''
    Class that handles the construction of an influxDB query and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self, influxdb_client, aux_data_config, influxdb_bucket=INFLUXDB_BUCKET):
        super().__init__(aux_data_config)
        self._query_filters = aux_data_config.get('query_filters', [])
        self._influxdb_client = influxdb_client
        self._influxdb_bucket = (
            aux_data_config['query_bucket']
            if 'query_bucket' in aux_data_config else influxdb_bucket
        )

    @staticmethod
    def _build_query_range(ts):
        '''
        Builds the temporal range for the influxDB query based on the provided
        timestamp (ts).
        '''
        str_start_ts = datetime.strftime(
                datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(seconds=20),
                "%Y-%m-%dT%H:%M:%SZ"
        )
        # Note: in the new code, you subtract a whole minute. Did we choose 20 s on purpose?

        ts_filter = f"time <= '{ts}' AND time > '{str_start_ts}'"
        return ts_filter

    def _build_query(self, ts):
        '''
        Builds the complete influxDB query using the provided timestamp (ts)
        and the class instance's query_measurements and query_fields values.
        '''

        str_field_names = ", ".join([
            f'"{q_field}"'
            for q_field in self._query_fields
        ])

        str_time_range = self._build_query_range(ts)

        str_filters = " AND ".join(self._query_filters + [str_time_range])

        # not sure what to do when there's more than one query measurement.
        # Is that even possible in influx v1?
        query = f'''SELECT {str_field_names}
        FROM "{self._influxdb_bucket}"."one_month"."{self._query_measurements[0]}"
        WHERE {str_filters}
        ORDER BY DESC LIMIT 1'''

        logging.debug("Query: %s", query)

        return query

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        For Influx, no persistent connection is needed.
        '''
        pass
    
    def close_connections(self):
        '''
        Close any open connections to external data sources.
        For Influx, no persistent connection is needed.
        '''
        pass
    
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

        except (InfluxDBClientError, InfluxDBServerError) as exc:
            _, value, _ = sys.exc_info()

            if str(value).startswith("(400)"):
                logging.error("InfluxDB API error, verify org: %s", INFLUXDB_ORG)
            elif str(value).startswith("(401)"):
                logging.error("InfluxDB API error, verify token: %s", INFLUXDB_AUTH_TOKEN)
            elif str(value).startswith("(404)"):
                logging.error("InfluxDB API error, verify bucket: %s", self._influxdb_bucket)
            else:
                logging.error("Error with query:")
                logging.error(query.replace("|>", '\n'))
                logging.error(str(exc))
                raise exc
        else:
            # Parse InfluxDB result into a dictionary format
            influx_data = {}
            for table in query_result:
                for record in table.records:
                    influx_data[record.get_field()] = record.get_value()

            aux_data_record = self._build_aux_data_dict(event['id'], influx_data)

            return aux_data_record

        return None
