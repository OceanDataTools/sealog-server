#!/usr/bin/env python3
'''
FILE:           sealog_auto_actions.py

DESCRIPTION:    Automated tests for sealog_auto_actions

BUGS:
NOTES:
AUTHOR:     Lindsey Jones
COMPANY:    Ocean Exploration Trust
VERSION:    1.0
CREATED:    2026-07-31

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2026
'''

import unittest

from unittest.mock import patch

from misc.sealog_auto_actions import (
    _handle_sample_event,
    _get_max_sample_num,
    EVENT_NAME_SAMPLE,
    OPTION_NAME_SAMPLE_ID,
    DEFAULT_SAMPLE_ID,
    PATTERN_SAMPLE_ID
)

CRUISE_ID = "NA001"

DB_EVENT_CLICKED_BUT_NOT_SUBMITTED = {'id': '', 'event_options': []}


def _build_ws_sample_event(sample_id: str):
    return {
        'id': '',
        'event_value': EVENT_NAME_SAMPLE,
        'event_options': [
            {
                'event_option_name': OPTION_NAME_SAMPLE_ID.lower(),
                'event_option_value': sample_id
            }
        ]
    }


def _build_db_sample_event(sample_id: str):
    return {
        'id': '',
        'event_options': [
            {'event_option_name': OPTION_NAME_SAMPLE_ID.lower(),
                'event_option_value': sample_id}
        ]
    }


class TestAutoSampleId(unittest.TestCase):
    '''
    Tests for automatically assigning a sample ID to sample events
    '''

    def test_get_max_sample_num_no_previous_samples_returns_0(self):
        '''If there are no previous sample events, _get_max_sample_num should return 0'''
        self.assertEqual(_get_max_sample_num([]), 0)

    def test_get_max_sample_num_no_valid_previous_samples_returns_0(self):
        '''
        If there are previous sample events, but they don't have valid sample IDs,
        _get_max_sample_num should still return 0
        '''
        events = [DB_EVENT_CLICKED_BUT_NOT_SUBMITTED,
                  _build_db_sample_event("auto")]
        max_sample_num_observed = _get_max_sample_num(events)
        self.assertEqual(0, max_sample_num_observed)

    def test_get_max_sample_num_incomplete_sample_events_gets_max_valid(self):
        '''
        _get_max_sample_num should return the highest sample ID value, ignoring incomplete events
        '''
        max_sample_num_expected = 2
        events = [DB_EVENT_CLICKED_BUT_NOT_SUBMITTED,
                  _build_db_sample_event("auto"),
                  _build_db_sample_event(f"{CRUISE_ID}-001"),
                  _build_db_sample_event(f"{CRUISE_ID}-{max_sample_num_expected:03d}")]
        max_sample_num_observed = _get_max_sample_num(events)
        self.assertEqual(max_sample_num_expected, max_sample_num_observed)

    def test_get_max_sample_num_out_of_order_sample_events_gets_max(self):
        '''
        _get_max_sample_num should return the highest sample ID value from the events given,
        regardless of their order. Events retrieved from the db will be in the order that they were
        created, but their sample IDs will be in the order they were submitted, so you can't just
        choose the most recent valid sample ID.
        '''
        events = [
            _build_db_sample_event(f"{CRUISE_ID}-001"),
            _build_db_sample_event(f"{CRUISE_ID}-003"),
            _build_db_sample_event(f"{CRUISE_ID}-002"),
        ]
        self.assertEqual(_get_max_sample_num(events), 3)

    def test_get_max_sample_invalid_previous_sample_event_throws_error(self):
        '''
        If there's a previous event with a sample ID that isn't the default but also doesn't match
        the pattern, something has gone wrong--throw an error. You have up to
        NUM_SAMPLES_TO_CHECK_FOR_IDS sample events to fix it until all of the sample numbers get
        messed up.
        '''
        events = [_build_db_sample_event("not-a-valid-id")]
        with self.assertRaises(ValueError):
            _get_max_sample_num(events)

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_no_previous_samples_assigns_001(
        self,
        mock_get_cruise_by_event,
        mock_get_events_by_cruise,
        mock_update_event
    ):
        '''
        If there are no previous sample events with filled-in IDs, should update current sample
        event with sample number 1
        '''

        mock_get_cruise_by_event.return_value = {
            'id': '',
            'cruise_id': CRUISE_ID
        }
        mock_get_events_by_cruise.return_value = []

        event = _build_ws_sample_event(DEFAULT_SAMPLE_ID)
        _handle_sample_event(event)

        mock_update_event.assert_called_once()
        updated_payload = mock_update_event.call_args[0][1]
        sample_id_observed = updated_payload['event_options'][0]['event_option_value']
        sample_num_observed = PATTERN_SAMPLE_ID.fullmatch(sample_id_observed).group('sample_num')
        self.assertEqual(int(sample_num_observed), 1)

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_previous_sample_event_adds_1(
        self,
        mock_get_cruise_by_event,
        mock_get_events_by_cruise,
        mock_update_event
    ):
        '''
        If there are previous sample events with filled-in IDs, should update current sample event
        with max sample number + 1
        '''
        mock_get_cruise_by_event.return_value = {
            'id': '',
            'cruise_id': CRUISE_ID
        }
        mock_get_events_by_cruise.return_value = [
            _build_db_sample_event(f"{CRUISE_ID}-005")
        ]

        event = _build_ws_sample_event(DEFAULT_SAMPLE_ID)
        _handle_sample_event(event)

        mock_update_event.assert_called_once()
        updated_payload = mock_update_event.call_args[0][1]
        sample_id_observed = updated_payload['event_options'][0]['event_option_value']
        sample_num_observed = PATTERN_SAMPLE_ID.fullmatch(sample_id_observed).group('sample_num')
        self.assertEqual(int(sample_num_observed), 6)

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_already_has_id_does_not_change(
        self,
        mock_get_cruise_by_event,
        mock_get_events_by_cruise,
        mock_update_event
    ):
        '''
        If a sample event already has an ID (i.e. the event is being updated for some reason other
        than initial submission), don't change it
        '''
        event = _build_ws_sample_event(f"{CRUISE_ID}-002")
        _handle_sample_event(event)

        mock_get_cruise_by_event.assert_not_called()
        mock_get_events_by_cruise.assert_not_called()
        mock_update_event.assert_not_called()

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_no_cruise_found_does_not_update(
        self,
        mock_get_cruise_by_event,
        mock_get_events_by_cruise,
        mock_update_event
    ):
        '''
        If there's no cruise found for the event, it should log an error but not do anything else
        '''
        mock_get_cruise_by_event.return_value = None

        event = _build_ws_sample_event(DEFAULT_SAMPLE_ID)
        with self.assertLogs(level='ERROR') as log:
            _handle_sample_event(event)

        mock_get_events_by_cruise.assert_not_called()
        mock_update_event.assert_not_called()
        self.assertIn('ERROR', log.output[0])
        self.assertIn('No cruise found', log.output[0])


if __name__ == '__main__':
    unittest.main()
