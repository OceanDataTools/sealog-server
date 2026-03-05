#!/usr/bin/env python3
'''
FILE:           aux_data_record_builder.py

DESCRIPTION:    This script builds a sealog aux_data record with data pulled from an
                influx v2 database.

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

from datetime import datetime, timedelta
from influxdb_client.rest import ApiException
from urllib3.exceptions import NewConnectionError

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.base_aux_data_record_builder import AuxDataRecordBuilder
from misc.influx_sealog.settings import (
    INFLUXDB_URL,
    INFLUXDB_AUTH_TOKEN,
    INFLUXDB_ORG,
    INFLUXDB_BUCKET
)


class SealogInfluxAuxDataRecordBuilder(AuxDataRecordBuilder):
    '''
    Class that handles the construction of an influxDB query and using the
    resulting data to build a sealog aux_data record.
    '''

    def __init__(self, influxdb_client, aux_data_config, influxdb_bucket=INFLUXDB_BUCKET):
        super().__init__(aux_data_config)
        self._influxdb_client = influxdb_client.query_api()
        self._influxdb_bucket = (
            aux_data_config['query_bucket']
            if 'query_bucket' in aux_data_config else influxdb_bucket
        )

    def _build_query_range(self, ts):
        '''
        Builds the temporal range for the influxDB query based on the provided
        timestamp (ts).

        Args:
            ts (str): Timestamp in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.fffZ)

        Returns:
            str or None: Query range string
        '''
        try:
            start_ts = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ") - timedelta(minutes=1)
            return f'start: {start_ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}, stop: {ts}'
        except ValueError as exc:
            self.logger.debug(str(exc))
            return None

    def _build_query(self, ts):
        '''
        Builds the complete influxDB query using the provided timestamp (ts)
        and the class instance's query_measurements and query_fields values.
        '''

        query = f'from(bucket: "{self._influxdb_bucket}")\n'

        query_range = self._build_query_range(ts)
        query += f'|> range({query_range})\n'

        filter_measurements = " or ".join([
            f'r["_measurement"] == "{q_measurement}"'
            for q_measurement in self._query_measurements
        ])
        query += f'|> filter(fn: (r) => {filter_measurements})\n'

        filter_fields = " or ".join([
            f'r["_field"] == "{q_field}"'
            for q_field in self._query_fields
        ])
        query += f'|> filter(fn: (r) => {filter_fields})\n'

        query += '|> sort(columns: ["_time"], desc: true)\n'
        query += '|> limit(n:1)'

        self.logger.debug("Query: %s", query)
        return query

    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        For Influx, no persistent connection is needed.
        '''

    def close_connections(self):
        '''
        Close any open connections to external data sources.
        For Influx, no persistent connection is needed.
        '''

    def build_aux_data_record(self, event):
        '''
        Build the aux_data record for the given event.
        '''

        self.logger.debug("building query")
        query = self._build_query(event['ts'])

        self.logger.debug("Query: %s", query)
        # run the query against the influxDB
        try:
            query_result = self._influxdb_client.query(query=query)

        except NewConnectionError:
            self.logger.error("InfluxDB connection error, verify URL: %s", INFLUXDB_URL)

        except ApiException as exc:
            _, value, _ = sys.exc_info()

            if str(value).startswith("(400)"):
                self.logger.error("InfluxDB API error, verify org: %s", INFLUXDB_ORG)
            elif str(value).startswith("(401)"):
                self.logger.error("InfluxDB API error, verify token: %s", INFLUXDB_AUTH_TOKEN)
            elif str(value).startswith("(404)"):
                self.logger.error("InfluxDB API error, verify bucket: %s", self._influxdb_bucket)
            else:
                self.logger.error("Error with query:")
                self.logger.error(query.replace("|>", '\n'))
                self.logger.error(str(exc))
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
