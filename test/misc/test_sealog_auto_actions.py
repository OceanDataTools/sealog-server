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
    _count_submitted_samples_for_cruise,
    EVENT_NAME_SAMPLE,
    OPTION_NAME_SAMPLE_ID,
    DEFAULT_SAMPLE_ID,
    PATTERN_SAMPLE_ID
)

CRUISE_ID = "NA001"

DB_EVENT_CLICKED_BUT_NOT_SUBMITTED = {'id': '',
                                      'event_value': EVENT_NAME_SAMPLE,
                                      'event_options': []}

DB_SAMPLE_INSITU_EVENT = {'id': '', 'event_value': f'{EVENT_NAME_SAMPLE}_INSITU'}


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
        'event_value': EVENT_NAME_SAMPLE,
        'event_options': [
            {'event_option_name': OPTION_NAME_SAMPLE_ID.lower(),
                'event_option_value': sample_id}
        ]
    }


class TestAutoSampleId(unittest.TestCase):
    '''
    Tests for automatically assigning a sample ID to sample events
    '''

    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    def test_count_submitted_samples_for_cruise_no_events_returns_0(
        self,
        mock_get_events_by_cruise
    ):
        '''
        If there are no events at all, return 0
        '''

        mock_get_events_by_cruise.return_value = []

        num_samples_observed = _count_submitted_samples_for_cruise(CRUISE_ID)
        self.assertEqual(num_samples_observed, 0)

    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    def test_count_submitted_samples_for_cruise_unsubmitted_samples_only_counts_submitted(
        self,
        mock_get_events_by_cruise
    ):
        '''
        If the db query returns sample events with good (numeric) IDs (i.e. have been submitted and
        assigned an ID), default IDs (i.e. have been submitted but not yet assigned an ID), and no
        IDs (i.e. have not been submitted), count the ones that have IDs
        '''
        num_samples_with_good_ids = 100
        num_samples_with_default_ids = 5
        # return an unsubmitted event with no sample ID
        events = [DB_EVENT_CLICKED_BUT_NOT_SUBMITTED]
        # return submitted events with valid numeric and default IDs
        for i in range(num_samples_with_good_ids):
            events.append(_build_db_sample_event(f"{CRUISE_ID}-{i+1:03d}"))
        for i in range(num_samples_with_default_ids):
            events.append(_build_db_sample_event(DEFAULT_SAMPLE_ID))
        # add another unsubmitted event at the end to confirm order doesn't matter
        events.append(DB_EVENT_CLICKED_BUT_NOT_SUBMITTED)
        mock_get_events_by_cruise.return_value = events

        num_samples_observed = _count_submitted_samples_for_cruise(CRUISE_ID)
        self.assertEqual(num_samples_observed,
                         num_samples_with_good_ids + num_samples_with_default_ids)

    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    def test_count_submitted_samples_for_cruise_multiple_event_types_only_counts_exact_match(
        self,
        mock_get_events_by_cruise
    ):
        '''
        If the db query returns EVENT_NAME_SAMPLE-type events and events with a type that contains
        but does not exactly match EVENT_NAME_SAMPLE, only count the EVENT_NAME_SAMPLEs
        '''
        num_exact_match_sample_events = 10
        events = [DB_SAMPLE_INSITU_EVENT]
        for i in range(num_exact_match_sample_events):
            events.append(_build_db_sample_event(f"{CRUISE_ID}-{i+1:03d}"))
        events.append(DB_SAMPLE_INSITU_EVENT)
        mock_get_events_by_cruise.return_value = events

        num_samples_observed = _count_submitted_samples_for_cruise(CRUISE_ID)
        self.assertEqual(num_samples_observed,
                         num_exact_match_sample_events)

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions._count_submitted_samples_for_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_has_auto_id_updates_with_num_samples(
        self,
        mock_get_cruise_by_event,
        mock_count_submitted_samples_for_cruise,
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
        mock_count_submitted_samples_for_cruise.return_value = 1

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

    @patch('misc.sealog_auto_actions.update_event')
    @patch('misc.sealog_auto_actions.get_events_by_cruise')
    @patch('misc.sealog_auto_actions.get_cruise_by_event')
    def test_handle_sample_event_bad_sample_id_logs_error(
        self,
        mock_get_cruise_by_event,
        mock_get_events_by_cruise,
        mock_update_event
    ):
        '''
        If there's no cruise found for the event, it should log an error but not do anything else
        '''
        mock_get_cruise_by_event.return_value = CRUISE_ID

        event = _build_ws_sample_event('006')
        with self.assertLogs(level='ERROR') as log:
            _handle_sample_event(event)

        mock_get_events_by_cruise.assert_not_called()
        mock_update_event.assert_not_called()
        self.assertIn('ERROR', log.output[0])
        self.assertIn('Malformed', log.output[0])


if __name__ == '__main__':
    unittest.main()
