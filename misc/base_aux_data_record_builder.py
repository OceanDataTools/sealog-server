#!/usr/bin/env python3
'''
FILE:           base_aux_data_record_builder.py

DESCRIPTION:    Base class for building sealog aux_data records from various data sources.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2025-02-25
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''
import json
import logging
from abc import ABC, abstractmethod


class AuxDataRecordBuilder(ABC):
    '''
    Abstract base class for building sealog aux_data records from various data sources.
    Handles common functionality for querying external data sources and building
    aux_data records with transformations.
    '''

    def __init__(self, aux_data_config):
        '''
        Initialize the base builder with configuration.

        Args:
            aux_data_config (dict): Configuration dictionary containing:
                - query_measurements: List of measurements to query
                - aux_record_lookup: Mapping of fields to output configuration
                - data_source: Name of the data source
        '''
        self._data_source = aux_data_config['data_source']
        # don't use get for data source--want to throw an error if not specified
        self._query_measurements = aux_data_config.get('query_measurements')
        self._aux_record_lookup = aux_data_config.get('aux_record_lookup')
        if self._aux_record_lookup is None:
            self._query_fields = []
        else:
            self._query_fields = list(self._aux_record_lookup.keys())
        self.logger = logging.getLogger(__name__)

    @abstractmethod
    def open_connections(self):
        '''
        Open any necessary connections to external data sources.
        Must be implemented by subclasses.
        '''

    @abstractmethod
    def close_connections(self):
        '''
        Close any open connections to external data sources.
        Must be implemented by subclasses.
        '''

    @abstractmethod
    def build_aux_data_record(self, event):
        '''
        Build the aux_data record for the given event.
        Must be implemented by subclasses.

        Args:
            event (dict): Event dictionary containing 'id' and 'ts' keys

        Returns:
            dict or None: Aux data record or None if no data available
        '''

    def _build_aux_data_dict(self, event_id, query_data):  # pylint:disable=R0915
        '''
        Internal method to build the sealog aux_data record using the event_id,
        query_data and the class instance's datasource value.

        This method handles common transformations and modifications across all data sources.

        Args:
            event_id (str): The ID of the event
            query_data (dict): Dictionary of field names to values from the data source

        Returns:
            dict or None: Aux data record or None if no data available
        '''
        aux_data_record = {
            'event_id': event_id,
            'data_source': self._data_source,
            'data_array': []
        }

        logging.debug("raw values: %s", json.dumps(query_data, indent=2))

        if not query_data:
            return None

        for key, value in self._aux_record_lookup.items():
            try:
                if "no_output" in value and value['no_output'] is True:
                    continue

                if key not in query_data:
                    continue

                output_value = query_data[key]

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

                                    if test['field'] not in query_data:
                                        logging.error("test field data not in query results")
                                        return None

                                    if 'eq' in test and query_data[test['field']] == test['eq']:
                                        test_result = True
                                        break

                                    if 'gt' in test and query_data[test['field']] > test['gt']:
                                        test_result = True
                                        break

                                    if 'gte' in test and query_data[test['field']] >= test['gte']:
                                        test_result = True
                                        break

                                    if 'lt' in test and query_data[test['field']] < test['lt']:
                                        test_result = True
                                        break

                                    if 'lte' in test and query_data[test['field']] <= test['lte']:
                                        test_result = True
                                        break

                                    if 'ne' in test and query_data[test['field']] != test['ne']:
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
                    'data_value': (
                        str(round(output_value, value['round']))
                        if 'round' in value
                        else str(output_value)
                    ),
                    'data_uom': value['uom'] if 'uom' in value else ''
                })
            except ValueError as exc:
                logging.warning("Problem adding %s", key)
                logging.debug(str(exc))
                continue

        if len(aux_data_record['data_array']) > 0:
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
