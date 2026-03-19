#!/usr/bin/env python3
'''
FILE:           base_aux_data_file_cleaner.py

DESCRIPTION:    Base class for cleaning up any changes made by aux_data_inserters outside
                of the aux data mongo collection.

BUGS:
NOTES:
AUTHOR:     Lindsey Jones
COMPANY:    OET
VERSION:    1.0
CREATED:    2026-02-20
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2025
'''
import logging

from abc import ABC, abstractmethod


class AuxDataFileCleaner(ABC):
    '''
    Abstract base class for building sealog aux_data records from various data sources.
    Handles common functionality for querying external data sources and building
    aux_data records with transformations.
    '''

    def __init__(self, aux_data_config):
        '''
        Initialize the base builder with configuration.
        '''
        self._data_source = aux_data_config['data_source']
        self.logger = logging.getLogger(__name__)

    def _get_aux_data_for_source(self, event):
        '''
        Get the aux data record for the given event based on the data source.

        Args:
            event (dict): Event dictionary containing 'id' and 'ts' keys

        Returns:
            str or None: ID of cleaned aux data record, if there is one
        '''
        all_aux_data = event.get('aux_data', {})
        if not all_aux_data:
            self.logger.debug("No aux data found for event %s", event['id'])
            return None

        # Find the first aux_data record that matches the data source
        # There should only ever be one record per data source
        aux_data_for_source = next(
            (aux_data for aux_data in all_aux_data
             if aux_data["data_source"] == self._data_source),
            None  # default if not found
        )

        if not aux_data_for_source:
            self.logger.debug("No %s aux data found for event %s", self._data_source, event['id'])

        return aux_data_for_source

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
    def clean_aux_data_record(self, event, dry_run):
        '''
        Do any clean up required for the given event
        Must be implemented by subclasses.

        Args:
            event (dict): Event dictionary containing 'id' and 'ts' keys
            dry_run (bool): If True, do not actually delete any aux data records

        Returns:
            dict or None: Aux data record or None if no data available
        '''

    @property
    def data_source(self):
        '''
        Getter method for the data_source property
        '''
        return self._data_source
