#!/usr/bin/env python3
'''
FILE:           sealog_report_builder.py

DESCRIPTION:    Contains the classes used for build cruise summary and lowering
                summary reports

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-05-03
REVISION:   2023-05-18

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import os
import sys
import csv
import math
import shutil
import logging
import tempfile
from io import BytesIO, StringIO
from datetime import datetime, timedelta

from reportlab.platypus import Paragraph, Table, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors

import cartopy.crs as ccrs
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as ticker

import numpy as np
import pandas as pd
from svglib.svglib import svg2rlg

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.python_sealog.lowerings import get_lowering, get_lowerings_by_cruise
from misc.python_sealog.cruises import get_cruise, get_cruise_by_lowering
from misc.python_sealog.events import get_events_by_lowering
from misc.python_sealog.event_exports import get_event_exports, get_event_exports_by_lowering
from misc.python_sealog.event_templates import get_event_templates

from misc.reporting.reporting_utils import strfdelta, seconds_to_hours_formatter

pd.set_option('mode.chained_assignment', None)

PAGE_SIZE = A4
PAGE_WIDTH, PAGE_HEIGHT= PAGE_SIZE
BASE_MARGIN = 5 * mm

POS_DATA_SOURCES = ['vehicleRealtimeNavData','vehicleRealtimeUSBLData']

class CruiseReportCreator: # pylint: disable=too-many-instance-attributes,too-few-public-methods,too-many-statements
    '''
    Creates the cruise summary report
    '''

    def __init__(self, cruise_uid):

        # Setup ReportLab styles for the report
        sample_style_sheet = getSampleStyleSheet()
        self.body_text = sample_style_sheet['BodyText']
        self.heading_1 = sample_style_sheet['Heading1']
        self.heading_2 = sample_style_sheet['Heading2']
        self.cover_header = ParagraphStyle(
                                        'CoverHeader',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=12,
                                        fontName='Helvetica-Bold'
                                       )
        self.table_text = ParagraphStyle(
                                        'TableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2
                                       )
        self.table_text_centered = ParagraphStyle(
                                        'TableTextCentered',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2,
                                        alignment=1
                                       )
        self.event_table_text = ParagraphStyle(
                                        'EventTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=0,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summary_table_text = ParagraphStyle(
                                        'SummaryTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summary_table_d2d_text = ParagraphStyle(
                                        'SummaryD2DTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=9,
                                        leading=8
                                       )
        self.sample_table_text = ParagraphStyle(
                                        'SampleTableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=5,
                                        # spaceAfter=2,
                                        leading=5
                                       )
        self.toc_heading_1 = ParagraphStyle(
                                            'TOCHeading1',
                                            parent=sample_style_sheet['Heading1'],
                                            fontSize=12,
                                            leftIndent=20,
                                            firstLineIndent=-20,
                                            spaceBefore=10,
                                            leading=16
                                        )
        self.toc_heading_2 = ParagraphStyle(
                                            'TOCHeading2',
                                            parent=sample_style_sheet['Heading2'],
                                            fontSize=10,
                                            leftIndent=40,
                                            firstLineIndent=-20,
                                            spaceBefore=0,
                                            leading=12
                                        )

        # Retrieve the cruise record from the sealog-server.
        logging.info("Retrieving cruise record")
        self.cruise_record = get_cruise(cruise_uid)

        # Retrieve the lowering records from the sealog-server. Need to reverse
        # the order to get oldest first.
        logging.info("Retrieving corresponding dive records")
        self.lowering_records = get_lowerings_by_cruise(cruise_uid) if self.cruise_record else list()
        self.lowering_records.reverse()

        # Modify the lowering records such that the milestones are datetime
        # objects, the max depth is a number and the bounding box is a list of
        # 4 floating point numbers.  Also add the various dive durations as
        # timedelta objects.
        for lowering in self.lowering_records:
            lowering['stats'], lowering['milestones'] = self._build_lowering_stats(lowering)


    def __del__(self):

        try:
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        except AttributeError:
            pass


    @staticmethod
    def _build_lowering_stats(lowering): # pylint: disable=too-many-branches,too-many-statements
        '''
        Return the stats and milestone from the lowering record but with the
        milestones as datetime objects, the max depth as a float, the
        bounding box as a list of 4 floats and the various dive durations as
        timedelta objects added to stats.
        '''

        logging.info('Processing %s milestones and stats data', lowering['lowering_id'])

        lowering_milestones = dict(
            start_dt = None,
            descending_dt = None,
            on_bottom_dt = None,
            off_bottom_dt = None,
            on_surface_dt = None,
            stop_dt = None
        )

        lowering_stats = dict(
            max_depth = 0,
            bounding_box = None,
            total_duration = None,
            launch_duration = None,
            descent_duration = None,
            on_bottom_duration = None,
            ascent_duration = None,
            recovery_duration = None,
            samples_collected = 0
        )

        try:
            lowering_milestones['start_dt'] = datetime.fromisoformat(lowering['start_ts'][:-1])
        except ValueError:
            pass

        try:
            lowering_milestones['stop_dt'] = datetime.fromisoformat(lowering['stop_ts'][:-1])
        except ValueError:
            pass

        if 'milestones' in lowering['lowering_additional_meta']:

            if 'lowering_descending' in lowering['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['descending_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_descending'][:-1])
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_on_bottom' in lowering['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['on_bottom_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_on_bottom'][:-1])
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_off_bottom' in lowering['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['off_bottom_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_off_bottom'][:-1])
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_on_surface' in lowering['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['on_surface_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_on_surface'][:-1])
                except ValueError:
                    pass
                except TypeError:
                    pass

        if 'stats' in lowering['lowering_additional_meta']:

            if 'max_depth' in lowering['lowering_additional_meta']['stats']:
                try:
                    lowering_stats['max_depth'] = float(lowering['lowering_additional_meta']['stats']['max_depth'])
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'bounding_box' in lowering['lowering_additional_meta']['stats']:
                try:
                    lowering_stats['bounding_box'] = [float(elem) for elem in lowering['lowering_additional_meta']['stats']['bounding_box']]
                except ValueError:
                    pass
                except TypeError:
                    pass

        # total_duration
        lowering_stats['total_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['start_dt']

        # launch_duration
        if lowering_milestones['start_dt'] and lowering_milestones['descending_dt']:
            lowering_stats['launch_duration'] = lowering_milestones['descending_dt'] - lowering_milestones['start_dt']

        # descent_duration
        if lowering_milestones['descending_dt'] and lowering_milestones['on_bottom_dt']:
            lowering_stats['descent_duration'] = lowering_milestones['on_bottom_dt'] - lowering_milestones['descending_dt']

        # on_bottom_duration
        if lowering_milestones['on_bottom_dt'] and lowering_milestones['off_bottom_dt']:
            lowering_stats['on_bottom_duration'] = lowering_milestones['off_bottom_dt'] - lowering_milestones['on_bottom_dt']

        # ascent_duration
        if lowering_milestones['off_bottom_dt'] and lowering_milestones['on_surface_dt']:
            lowering_stats['ascent_duration'] = lowering_milestones['on_surface_dt'] - lowering_milestones['off_bottom_dt']

        # recovery_duration
        if lowering_milestones['on_surface_dt'] and lowering_milestones['stop_dt']:
            lowering_stats['recovery_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['on_surface_dt']

        # sample events
        event_data = get_events_by_lowering(lowering['id'], event_filter=["SAMPLE"])

        # filter out events that include the value "SAMPLE" but are not
        # "SAMPLE". i.e. "SAMPLE_INSITU"
        if event_data:
            event_data = list(filter(lambda event: event['event_value'] == "SAMPLE", event_data))
            lowering_stats['samples_collected'] = len(event_data)

        return lowering_stats, lowering_milestones


    def _build_stat_table(self):
        '''
        Build the lowering stats reportlab table
        '''

        logging.info("Building dive stats table")

        # This is the data that will be used to populate the lowering stats
        # table.  This first list will become the table header.
        stat_data = [
            [
                'Dive ID',
                'Location',
                'Deck to Deck',
                'Deployment',
                'Descent',
                'Seabed',
                'Ascent',
                'Recovery',
                'Max Depth',
                'Samples'
            ]
        ]

        # This dict will contain the running totals for all the lowering
        # records.
        totals = dict(
            {
                'total_duration': timedelta(),
                'launch_duration': timedelta(),
                'descent_duration': timedelta(),
                'on_bottom_duration': timedelta(),
                'ascent_duration': timedelta(),
                'recovery_duration': timedelta(),
                'max_depth': 0,
                'samples_collected': 0,
                'lowerings_aborted': 0,
            }
        )

        # Loop through the lowering records.
        for lowering in self.lowering_records:

            # Add row to lowering stats data using the lowering record.
            stat_data.append( [
                lowering['lowering_id'],
                lowering['lowering_location'],
                strfdelta(lowering['stats']['total_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                strfdelta(lowering['stats']['launch_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                strfdelta(lowering['stats']['descent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                strfdelta(lowering['stats']['on_bottom_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                strfdelta(lowering['stats']['ascent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                strfdelta(lowering['stats']['recovery_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                str(lowering['stats']['max_depth']) + 'm' if lowering['stats']['max_depth'] else '',
                str(lowering['stats']['samples_collected']) if lowering['stats']['samples_collected'] else '0'
            ])

            # Update the totals using the lowering record.
            totals['total_duration'] += lowering['stats']['total_duration'] if lowering['stats']['total_duration'] else timedelta()
            totals['launch_duration'] += lowering['stats']['launch_duration'] if lowering['stats']['launch_duration'] else timedelta()
            totals['descent_duration'] += lowering['stats']['descent_duration'] if lowering['stats']['descent_duration'] else timedelta()
            totals['on_bottom_duration'] += lowering['stats']['on_bottom_duration'] if lowering['stats']['on_bottom_duration'] else timedelta()
            totals['ascent_duration'] += lowering['stats']['ascent_duration'] if lowering['stats']['ascent_duration'] else timedelta()
            totals['recovery_duration'] += lowering['stats']['recovery_duration'] if lowering['stats']['recovery_duration'] else timedelta()
            if lowering['stats']['max_depth']:
                totals['max_depth'] = lowering['stats']['max_depth'] if lowering['stats']['max_depth'] > totals['max_depth'] else totals['max_depth']

            if lowering['stats']['samples_collected']:
                totals['samples_collected'] += lowering['stats']['samples_collected']

            if 'lowering_aborted' in lowering['milestones']:
                totals['lowering_aborted'] += 1

        # Add the totals as the last row in the stats data.
        stat_data.append([
            'Totals',
            str(len(self.lowering_records)) + ' Dives',
            strfdelta(totals['total_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            strfdelta(totals['launch_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            strfdelta(totals['descent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            strfdelta(totals['on_bottom_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            strfdelta(totals['ascent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            strfdelta(totals['recovery_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            str(totals['max_depth']) + 'm',
            totals['samples_collected'],
            totals['lowerings_aborted']
        ])

        # Use the lowering stats data to build the reportlab table object.
        stat_table = Table(stat_data, style=[
                            ('BOX',(0,0),(-1,-1),1,colors.black),
                            ('GRID',(0,0),(-1,-1),1,colors.black),
                            ('FONTSIZE',(0,0),(-1,-1),6),
                            ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
                            ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
                            ('LEADING',(0,0),(-1,-1),6),
                            ('ALIGN',(0,0),(-1,-1),'CENTER'),
                            ('BACKGROUND',(0,0),(-1,0),colors.lightgrey),
                            ('BACKGROUND',(0,-1),(-1,-1),colors.lightgrey)
                        ])

        return stat_table


    def _build_lowerings_map(self): # pylint: disable=too-many-locals
        '''
        Build a map show the lowering locations
        '''

        if not self.lowering_records:
            logging.warning("No lowerings found for cruise")
            return None

        logging.info('Building map of dive locations')

        bbox = []
        dive_centers = []
        dive_labels = []
        for lowering in self.lowering_records:

            logging.info(f'\t- Dive: {lowering["lowering_id"]}')

            if 'stats' in lowering and 'bounding_box' in lowering['stats'] and isinstance(lowering['stats']['bounding_box'], list) and len(lowering['stats']['bounding_box']) > 0:

                dive_labels.append(lowering['lowering_id'])
                dive_centers.append([(lowering['stats']['bounding_box'][0] + lowering['stats']['bounding_box'][2])/2,(lowering['stats']['bounding_box'][1] + lowering['stats']['bounding_box'][3])/2])

                if len(bbox) == 0:
                    bbox = lowering['stats']['bounding_box']
                    continue

                if lowering['stats']['bounding_box'][0] > bbox[0]:
                    bbox[0] = lowering['stats']['bounding_box'][0]

                if lowering['stats']['bounding_box'][1] > bbox[1]:
                    bbox[1] = lowering['stats']['bounding_box'][1]

                if lowering['stats']['bounding_box'][2] < bbox[2]:
                    bbox[2] = lowering['stats']['bounding_box'][2]

                if lowering['stats']['bounding_box'][3] < bbox[3]:
                    bbox[3] = lowering['stats']['bounding_box'][3]

        fig_dive_locations = plt.figure()
        ax_dive_locations = plt.axes(projection=ccrs.PlateCarree())

        lower_left = (math.ceil(bbox[1] * 50)/50.0, math.floor(bbox[2] * 50)/50)
        upper_right = (math.floor(bbox[3] * 50)/50, math.ceil(bbox[0] * 50)/50.0)
        east_west = upper_right[0] - lower_left[0]
        south_north = upper_right[1] - lower_left[1]
        side = max(abs(east_west),abs(south_north)) * 1.25
        mid_x, mid_y = lower_left[0]+east_west/2.0, lower_left[1]+south_north/2.0  #center location

        ax_dive_locations.set_extent([mid_x-side/2.0, mid_x+side/2.0, mid_y-side/2.0, mid_y+side/2.0])   # map coordinates, meters

        for idx, dive_center in enumerate(dive_centers):
            ax_dive_locations.plot(dive_center[1], dive_center[0], linestyle='none', marker="o", markersize=5, alpha=0.6, c="green", markeredgecolor="black", markeredgewidth=1)
            ax_dive_locations.annotate(dive_labels[idx], (dive_center[1], dive_center[0]), textcoords ='offset points', xytext=(3,3), rotation=45, fontsize=8)

        ax_dive_locations.coastlines()
        ax_dive_locations.gridlines(draw_labels=True, dms=False, x_inline=False, y_inline=False)

        imgdata = BytesIO()

        # fig_dive_locations.tight_layout()
        fig_dive_locations.savefig(imgdata, format='svg')
        plt.close(fig_dive_locations)
        imgdata.seek(0)

        svg_2_image_file = svg2rlg(imgdata)

        return svg_2_image_file


    def _build_watch_change_summary_table(self):

        logging.info('Building table of watch change stats')

        raw_cols = ['ts', 'event_option.co-pilot', 'event_option.datalogger', 'event_option.pilot']

        df_watchstander_tot = pd.DataFrame(columns=['name','co-pilot', 'datalogger', 'pilot'])

        for lowering in self.lowering_records:

            logging.info(f'\t- Dive: {lowering["lowering_id"]}')

            watch_change_events = get_events_by_lowering(lowering['id'],event_filter=['WATCH CHANGE'], export_format='csv')

            # load data into dataframe
            buf = StringIO(watch_change_events)
            df = pd.read_csv(buf, usecols=lambda x: x in raw_cols)
            df.rename(columns={'event_option.co-pilot':'co-pilot','event_option.pilot':'pilot','event_option.datalogger':'datalogger'}, inplace=True)
            
            # convert ts to datetime
            df['ts'] = pd.to_datetime(df['ts'], utc=True)
            
            for watch_position in ['pilot', 'co-pilot', 'datalogger']:

                if watch_position not in df.columns:
                    continue
            
                # crop out the pilot change records, remove row with pilot == NaN
                df_watchstander = df[['ts', watch_position]]
                df_watchstander = df_watchstander.dropna()

                # add dummy record with lowering stopTS
                df_watchstander.loc[len(df_watchstander.index)] = [pd.to_datetime(lowering['stop_ts']), np.nan] 
            
                # calculate time diffs shift time diff column -1 and remove dummy row
                df_watchstander['time_diff']=df_watchstander['ts'].diff()
                df_watchstander['time_diff']=df_watchstander['time_diff'].shift(-1)
                df_watchstander = df_watchstander[:-1]
            
                #print(df_watchstander)
                sum_by_position = df_watchstander.groupby(watch_position)['time_diff'].sum()
                # print(sum_by_position)
                sum_df = sum_by_position.to_frame().reset_index()
                sum_df.rename(columns={watch_position:'name','time_diff':watch_position}, inplace=True)
                # print(sum_df)
                
                #add this data to the totals df
                df_watchstander_tot = pd.concat([
                        df_watchstander_tot,
                        sum_df
                    ],
                    ignore_index=True
                )

        # Convert duration columns to timedelta if necessary
        duration_columns = ['pilot', 'co-pilot', 'datalogger']
        df_watchstander_tot[duration_columns] = df_watchstander_tot[duration_columns]

        # Group by 'name' and calculate the sum of duration columns
        sum_duration = df_watchstander_tot.groupby('name', as_index=False)[duration_columns].sum()

        watch_change_table_data = [
           [
            '',
            Paragraph('''<b>Pilot:</b>''',self.body_text),
            Paragraph('''<b>Co-Pilot:</b>''',self.body_text),
            Paragraph('''<b>Datalogger:</b>''',self.body_text),
            ]
        ]

        watch_change_table_data.extend(np.array(sum_duration).tolist())

        watch_change_table = Table(watch_change_table_data, style=[
            ('BOX',(0,1),(0,-1),1,colors.black),
            ('GRID',(0,1),(0,-1),1,colors.black),
            ('BOX',(1,0),(-1,-1),1,colors.black),
            ('GRID',(1,0),(-1,-1),1,colors.black),
            ('BACKGROUND', (1,0),(-1,0), colors.lightgrey)
            #('NOSPLIT', (0, 0), (-1, -1))
        ])

        return watch_change_table


class LoweringReportCreator: # pylint: disable=too-many-instance-attributes,too-few-public-methods
    '''
    Creates the lowering summary report
    '''

    def __init__(self, lowering_uid):
        sample_style_sheet = getSampleStyleSheet()
        self.body_text = sample_style_sheet['BodyText']
        self.heading_1 = sample_style_sheet['Heading1']
        self.heading_2 = sample_style_sheet['Heading2']
        self.cover_header = ParagraphStyle(
                                        'CoverHeader',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=12,
                                        fontName='Helvetica-Bold'
                                       )
        self.table_text = ParagraphStyle(
                                        'TableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2
                                       )
        self.table_text_centered = ParagraphStyle(
                                        'TableTextCentered',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2,
                                        alignment=1
                                       )
        self.event_table_text = ParagraphStyle(
                                        'EventTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=0,
                                        fontSize=7,
                                        leading=8
                                       )
        self.summary_table_text = ParagraphStyle(
                                        'SummaryTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summary_table_d2d_text = ParagraphStyle(
                                        'SummaryD2DTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=9,
                                        leading=8
                                       )
        self.sample_table_text = ParagraphStyle(
                                        'SampleTableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=5,
                                        # spaceAfter=2,
                                        leading=5
                                       )
        self.toc_heading_1 = ParagraphStyle(
                                            'TOCHeading1',
                                            parent=sample_style_sheet['Heading1'],
                                            fontSize=12,
                                            leftIndent=20,
                                            firstLineIndent=-20,
                                            spaceBefore=10,
                                            leading=16
                                        )
        self.toc_heading_2 = ParagraphStyle(
                                            'TOCHeading2',
                                            parent=sample_style_sheet['Heading2'],
                                            fontSize=10,
                                            leftIndent=40,
                                            firstLineIndent=-20,
                                            spaceBefore=0,
                                            leading=12
                                        )

        # Date/Time format to use when converting datetime object to strings.
        self.time_format = '%Y-%m-%d %H:%M:%S'

        # Make a tmp directory.  This will be used for storing intermediate
        # files such as thumbnail images.
        self.tmp_dir = tempfile.mkdtemp()

        # Class properties to store the lowering events/aux_data as a numpy
        # array and the header record for that numpy array.
        self.lowering_data = None
        self.lowering_data_headers = None

        # Retrieve the cruise and lowering records for the lowering_id
        logging.info("Retrieving dive record")
        self.lowering_record = get_lowering(lowering_uid)

        logging.info("Retrieving corresponding cruise record")
        self.cruise_record = get_cruise_by_lowering(lowering_uid)

        # Import the events and aux data for the lowering.
        self._import_lowering_data()

        # Modify the lowering record such that the milestones are datetime
        # objects, the max depth is a number and the bounding box is a list of
        # 4 floating point numbers.  Also add the various dive durations as
        # timedelta objects.
        self._build_lowering_stats()


    def __del__(self):

        # Delete the temporary directory that was created to store the
        # intermediate files.
        try:
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        except AttributeError:
            pass


    def _build_text_comment(self, event_row):
        text_comment = []
        
        if event_row[self.lowering_data_headers.index('event_free_text')] and event_row[self.lowering_data_headers.index('event_free_text')] != '':
            text_comment.append(event_row[self.lowering_data_headers.index('event_free_text')])

        if 'event_option.comment' in self.lowering_data_headers and event_row[self.lowering_data_headers.index('event_option.comment')] and event_row[self.lowering_data_headers.index('event_option.comment')] != '':
            text_comment.append(event_row[self.lowering_data_headers.index('event_option.comment')])

        return '<br/><br/>'.join(text_comment)


    def _import_lowering_data(self):
        '''
        Ingest the events and aux_data for the lowering.  Build the
        lowering_data numpy array and lowering_data_header list.
        '''

        logging.info("Processing %s event data", self.lowering_record['lowering_id'])

        event_export_data = get_event_exports_by_lowering(self.lowering_record['id'], export_format='csv')
        # event_export_data = get_event_exports(startTS=self.lowering_record['lowering_additional_meta']['milestones']['lowering_descending'][:-1], stopTS=self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_surface'][:-1], export_format='csv')

        # Build a temp file containing the csv export of the lowering data.
        # Use this file to extract the header data (first row of file) and to
        # import the data into a numpy array.
        with tempfile.TemporaryFile(mode='w+') as file:

            file.write(event_export_data)
            file.seek(0)

            reader = csv.reader(file, delimiter=',')
            self.lowering_data_headers = next(reader)
            self.lowering_data = np.array(list(reader))

        # logging.error(self.lowering_data_headers)

        # Converting ts column in the lowering_data from string to datetime
        for row in range(len(self.lowering_data)):
            date = datetime.fromisoformat(self.lowering_data[row][self.lowering_data_headers.index( 'ts' )][:-1])
            self.lowering_data[[row],[self.lowering_data_headers.index( 'ts' )]] = np.datetime64(date)


    def _build_lowering_stats(self): # pylint: disable=too-many-branches,too-many-statements
        '''
        builds the lowering stats and lowering milestones object for the given lowering.
        '''

        logging.info("Processing %s milestone and stats data", self.lowering_record['lowering_id'])

        lowering_milestones = dict(
            start_dt = None,
            descending_dt = None,
            on_bottom_dt = None,
            off_bottom_dt = None,
            on_surface_dt = None,
            stop_dt = None
        )

        lowering_stats = dict(
            max_depth = 0,
            bounding_box = None,
            total_duration = None,
            launch_duration = None,
            descent_duration = None,
            on_bottom_duration = None,
            ascent_duration = None,
            recovery_duration = None,
            samples_collected = 0
        )

        try:
            lowering_milestones['start_dt'] = datetime.fromisoformat(self.lowering_record['start_ts'][:-1] + '+00:00')
        except ValueError:
            pass

        try:
            lowering_milestones['stop_dt'] = datetime.fromisoformat(self.lowering_record['stop_ts'][:-1] + '+00:00')
        except ValueError:
            pass

        if 'milestones' in self.lowering_record['lowering_additional_meta']:

            if 'lowering_descending' in self.lowering_record['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['descending_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_descending'][:-1] + '+00:00')
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_on_bottom' in self.lowering_record['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['on_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_bottom'][:-1] + '+00:00')
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_off_bottom' in self.lowering_record['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['off_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_off_bottom'][:-1] + '+00:00')
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'lowering_on_surface' in self.lowering_record['lowering_additional_meta']['milestones']:
                try:
                    lowering_milestones['on_surface_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_surface'][:-1] + '+00:00')
                except ValueError:
                    pass
                except TypeError:
                    pass

        if 'stats' in self.lowering_record['lowering_additional_meta']:

            if 'max_depth' in self.lowering_record['lowering_additional_meta']['stats']:
                try:
                    lowering_stats['max_depth'] = float(self.lowering_record['lowering_additional_meta']['stats']['max_depth'])
                except ValueError:
                    pass
                except TypeError:
                    pass

            if 'bounding_box' in self.lowering_record['lowering_additional_meta']['stats']:
                try:
                    lowering_stats['bounding_box'] = [float(elem) for elem in self.lowering_record['lowering_additional_meta']['stats']['bounding_box']]
                except ValueError:
                    pass
                except TypeError:
                    pass

        # total_duration
        lowering_stats['total_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['start_dt']

        # launch_duration
        if lowering_milestones['start_dt'] and lowering_milestones['descending_dt']:
            lowering_stats['launch_duration'] = lowering_milestones['descending_dt'] - lowering_milestones['start_dt']

        # descent_duration
        if lowering_milestones['descending_dt'] and lowering_milestones['on_bottom_dt']:
            lowering_stats['descent_duration'] = lowering_milestones['on_bottom_dt'] - lowering_milestones['descending_dt']

        # on_bottom_duration
        if lowering_milestones['on_bottom_dt'] and lowering_milestones['off_bottom_dt']:
            lowering_stats['on_bottom_duration'] = lowering_milestones['off_bottom_dt'] - lowering_milestones['on_bottom_dt']

        # ascent_duration
        if lowering_milestones['off_bottom_dt'] and lowering_milestones['on_surface_dt']:
            lowering_stats['ascent_duration'] = lowering_milestones['on_surface_dt'] - lowering_milestones['off_bottom_dt']

        # recovery_duration
        if lowering_milestones['on_surface_dt'] and lowering_milestones['stop_dt']:
            lowering_stats['recovery_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['on_surface_dt']

        # sample events
        event_data = get_events_by_lowering(self.lowering_record['id'], event_filter=["SAMPLE"])

        # filter out events that include the value "SAMPLE" but are not
        # "SAMPLE". i.e. "SAMPLE_INSITU"
        if event_data:
            event_data = list(filter(lambda event: event['event_value'] in ['SAMPLE', 'Biology Sample', 'GTB Gas Sample', 'GTHFS Gas Sample','Geology Sample','HFS Fluid Sample','NISKIN Fluid Sample'], event_data))
            lowering_stats['samples_collected'] = len(event_data)

        # Add milestones and stats to class lowering_record
        self.lowering_record['milestones'] = lowering_milestones
        self.lowering_record['stats'] = lowering_stats


    def _build_stat_table(self):
        '''
        Build the lowering stats reportlab table
        '''

        logging.info('Building %s stats table', self.lowering_record['lowering_id'])

        stat_data = [
            [
                Paragraph('''<b>Start of Dive:</b>''', self.table_text),
                self.lowering_record['milestones']['start_dt'].strftime(self.time_format),
                Paragraph('''<b>Total Duration:</b>''',self.table_text),
                strfdelta(self.lowering_record['stats']['total_duration'])
            ],
            [
                Paragraph('''<b>On Bottom /<br/>@ Target Depth:</b>''', self.table_text),
                self.lowering_record['milestones']['on_bottom_dt'].strftime(self.time_format) if self.lowering_record['milestones']['on_bottom_dt'] else '',
                Paragraph('''<b>Descent Duration:</b>''',self.table_text),
                strfdelta(self.lowering_record['stats']['descent_duration'])
            ],
            [
                Paragraph('''<b>Off Bottom:</b>''',self.table_text),
                self.lowering_record['milestones']['off_bottom_dt'].strftime(self.time_format) if self.lowering_record['milestones']['off_bottom_dt'] else '',
                Paragraph('''<b>On bottom /<br/>@ Target Depth Duration:</b>''',self.table_text),
                strfdelta(self.lowering_record['stats']['on_bottom_duration'])
            ],
            [
                Paragraph('''<b>End of Dive:</b>''',self.table_text),
                self.lowering_record['milestones']['stop_dt'].strftime(self.time_format),
                Paragraph('''<b>Ascent Duration:</b>''',self.table_text),
                strfdelta(self.lowering_record['stats']['ascent_duration'])
            ],
            [
                Paragraph('''<b>Max Depth:</b>''',self.table_text),
                str(self.lowering_record['stats']['max_depth']) + ' meters' if self.lowering_record['stats']['max_depth'] else '',
                Paragraph('''<b>Samples Collected:</b>''',self.table_text),
                str(self.lowering_record['stats']['samples_collected']) if self.lowering_record['stats']['samples_collected'] else '0'
            ],
            [
                Paragraph('''<b>Bounding Box:</b>''',self.table_text),
                ', '.join([str(pos) for pos in self.lowering_record['stats']['bounding_box']]) if self.lowering_record['stats']['bounding_box'] else ''
            ],

        ]

        stat_table = Table(stat_data, colWidths=[2.8*cm,3*cm,4*cm,2.5*cm], style=[
                            ('BOX',(0,0),(-1,-1),1,colors.black),
                            ('LINEAFTER',(1,0),(1,4),1,colors.black),
                            ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                            ('FONTSIZE',(0,0),(-1,-1),8),
                            ('SPAN',(1,-1),(-1,-1)),
                            ('VALIGN',(0,0),(-1,-1),'TOP'),
                            ('NOSPLIT',(0,0),(-1,-1))
                        ])

        return stat_table


    def _build_summary_table(self):
        '''
        Build the lowering summary reportlab table
        '''

        logging.info("Building %s summary table", self.lowering_record['lowering_id'])

        svg_2_image_file = svg2rlg(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/dive_information_diagram_subastian.svg')))
        dive_stage_image = Image(svg_2_image_file)

        dive_stage_image._restrictSize(PAGE_WIDTH/2, 20 * cm) # pylint: disable=protected-access
        dive_stage_image.hAlign = 'CENTER'

        summary_data = [
            [
                dive_stage_image
            ],
            [
                'Stage',
                'Date/Time',
                'Stage Duration',
                'Total'
            ],
            [
                'Off-Deck',
                self.lowering_record['milestones']['start_dt'].strftime(self.time_format),
                Paragraph('<b>Deployment:</b><br/>' + strfdelta(self.lowering_record['stats']['launch_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.table_text_centered) if self.lowering_record['stats']['launch_duration'] else Paragraph('<b>Deployment</b><br/>n/a', self.table_text_centered),
                Paragraph('<b>Deck-to-deck:</b><br/>' + strfdelta(self.lowering_record['stats']['total_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summary_table_d2d_text) if self.lowering_record['stats']['total_duration'] else Paragraph('<b>Deck-to-deck:</b><br/>n/a', self.summary_table_d2d_text)
            ],
            [
                'Last Float On', self.lowering_record['milestones']['descending_dt'].strftime(self.time_format) if self.lowering_record['milestones']['descending_dt'] else ''
            ],
            [
                '',
                '',
                Paragraph('<b>Descent: </b>' + strfdelta(self.lowering_record['stats']['descent_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.table_text_centered) if self.lowering_record['stats']['descent_duration'] else Paragraph('<b>Descent:</b><br/>n/a', self.table_text_centered)
            ],
            [
                'On Bottom/@ Depth', self.lowering_record['milestones']['on_bottom_dt'].strftime(self.time_format) if self.lowering_record['milestones']['on_bottom_dt'] else '',
                Paragraph('<b>On Bottom/@ Depth:</b><br/>' + strfdelta(self.lowering_record['stats']['on_bottom_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.table_text_centered) if self.lowering_record['stats']['on_bottom_duration'] else Paragraph('<b>On Bottom/@Target Depth:</b><br/>n/a', self.table_text_centered)
            ],
            [
                'Off Bottom/@ Depth', self.lowering_record['milestones']['off_bottom_dt'].strftime(self.time_format) if self.lowering_record['milestones']['off_bottom_dt'] else ''
            ],
            [
                '',
                '',
                Paragraph('<b>Ascent: </b>' + strfdelta(self.lowering_record['stats']['ascent_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.table_text_centered) if self.lowering_record['stats']['ascent_duration'] else Paragraph('<b>Ascent:</b><br/>n/a', self.table_text_centered)
            ],
            [
                'Floats On Surface',
                self.lowering_record['milestones']['on_surface_dt'].strftime(self.time_format) if self.lowering_record['milestones']['on_surface_dt'] else '',
                Paragraph('<b>Recovery:</b><br/>' + strfdelta(self.lowering_record['stats']['recovery_duration'], fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.table_text_centered) if self.lowering_record['stats']['recovery_duration'] else Paragraph('<b>Recovery:</b><br/>n/a', self.table_text_centered)
            ],
            [
                'On-Deck / End',
                self.lowering_record['milestones']['stop_dt'].strftime(self.time_format)
            ],
            [
                Paragraph('<b>Bounding Box:</b> ' + ', '.join([str(pos) for pos in self.lowering_record['stats']['bounding_box']]), self.table_text) if self.lowering_record['stats']['bounding_box'] else ''
            ],
            [
                Paragraph('<b>Max Depth:</b> ' + str(self.lowering_record['stats']['max_depth']) if self.lowering_record['stats']['max_depth'] else '', self.table_text),
                '',
                Paragraph('<b>Samples Collected:</b> ' + str(self.lowering_record['stats']['samples_collected']) if self.lowering_record['stats']['samples_collected'] else '0', self.table_text),

            ]
        ]

        summary_table = Table(summary_data, colWidths=[3*cm,3*cm,3.5*cm,3.25*cm], style=[
                                ('BOX',(0,1),(-1,-1),.5,colors.black),
                                ('GRID',(0,1),(-1,-1),.5,colors.black),
                                ('SPAN',(0,0),(-1,0)),
                                ('SPAN',(2,2),(2,3)),
                                ('SPAN',(0,4),(1,4)),
                                ('BACKGROUND', (0, 4), (2, 4), colors.lightgrey),
                                ('SPAN',(2,5),(2,6)),
                                ('SPAN',(0,7),(1,7)),
                                ('BACKGROUND', (0, 7), (2, 7), colors.lightgrey),
                                ('SPAN',(2,8),(2,9)),
                                ('SPAN',(3,2),(3,9)),
                                ('SPAN',(0,10),(3,10)),
                                ('SPAN',(0,11),(1,11)),
                                ('SPAN',(2,11),(3,11)),
                                ('FONTSIZE',(0,0),(-1,-1),8),
                                ('ALIGNMENT',(0,0),(-1,-1),'CENTER'),
                                ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                                ('BOTTOMPADDING',(0,0),(0,0),15),
                                ('BOTTOMPADDING',(1,0),(-1,-1),0),
                                ('TOPPADDING',(0,0),(-1,-1),2),
                                ('BACKGROUND', (0, 1), (-1, 1), colors.lightgrey)
                            ])

        return summary_table


    def _build_depth_plot(self):
        '''
        Build the lowering depth plot and return it as a SVG image
        '''

        logging.info("Building %s depth profile", self.lowering_record['lowering_id'])

        depth_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't build depth profile from this source.", data_source)

        if depth_data_source is None:
            return None

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['descending_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['on_surface_dt']))

        depth_plot_data = self.lowering_data[idx,:]

        start_ts = next((datetime.fromisoformat(ts[0]) for ts in depth_plot_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        fig_depth_plot, ax_depth_plot = plt.subplots(figsize=(7,2.5))

        x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in depth_plot_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
        y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in depth_plot_data[:,[self.lowering_data_headers.index( depth_data_source + '.depth_value' )]]]

        ax_depth_plot.plot(x_ts,y_depth)
        ax_depth_plot.invert_yaxis()
        ax_depth_plot.xaxis.set_major_locator(mdates.HourLocator(interval=4))
        ax_depth_plot.set(ylabel='Depth [m]', title='Depth Profile')

        formatter = mdates.DateFormatter("%H:00")
        ax_depth_plot.xaxis.set_major_formatter(formatter)

        ax_depth_plot.yaxis.grid(linestyle='--')

        imgdata = BytesIO()

        fig_depth_plot.tight_layout()
        fig_depth_plot.savefig(imgdata, format='svg')
        plt.close(fig_depth_plot)
        imgdata.seek(0)

        svg_2_image_file = svg2rlg(imgdata)

        return svg_2_image_file


    def _build_depths_plot(self):
        '''
        Build the lowering depth sensors plot and return it as a SVG image
        '''

        logging.info("Building %s depth profiles", self.lowering_record['lowering_id'])

        if 'vehicleRealtimeNavData.depth_value' not in self.lowering_data_headers and 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers and 'vehicleRealtimeParoData.depth_value' not in self.lowering_data_headers:
            logging.warning("No depth data captured, can't build depths profile.")
            return None

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['descending_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['on_surface_dt']))

        depths_plot_data = self.lowering_data[idx,:]

        start_ts = next((datetime.fromisoformat(ts[0]) for ts in depths_plot_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)
        # start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        # fig_depths_plot, ax_depths_plot = plt.subplots()
        fig_depths_plot, ax_depths_plot = plt.subplots(figsize=(7,5))

        # error_row=0

        x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in depths_plot_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
        ax_depths_plot.set_title(label='Depth Sensor Comparison Data', pad=25)
        ax_depths_plot.set(ylabel='Depth [m]')

        formatter = mdates.DateFormatter("%H:00")
        ax_depths_plot.xaxis.set_major_formatter(formatter)

        ax_depths_plot.yaxis.grid(linestyle='--')

        ax_depths_plot.invert_yaxis()
        ax_depths_plot.xaxis.set_major_locator(mdates.HourLocator(interval=4))

        if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers:
            y_depth_sprint = [ float(depthStr[0]) if depthStr[0] else None for depthStr in depths_plot_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_sprint,label='Sprint')

        if 'vehicleRealtimeCTDData.depth_value' in self.lowering_data_headers:
            y_depth_ctd = [ float(depthStr[0]) if depthStr[0] else None for depthStr in depths_plot_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_ctd,label='CTD')

        if 'vehicleRealtimeParoData.depth_value' in self.lowering_data_headers:
            y_depth_paro = [ float(depthStr[0]) if depthStr[0] else None for depthStr in depths_plot_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeParoData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_paro,label='Paro')

        ax_depths_plot.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_depths_plot.tight_layout()
        fig_depths_plot.savefig(imgdata, format='svg')
        plt.close(fig_depths_plot)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_dive_track(self): # pylint: disable=too-many-locals
        '''
        Build the lowering dive track and return it as a SVG image
        '''

        logging.info("Building %s trackline", self.lowering_record['lowering_id'])

        trackline_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.latitude_value' in self.lowering_data_headers:
                trackline_data_source = data_source
                break

            logging.warning("No %s lat/lng data captured, can't build dive track from this source.", data_source)

        if trackline_data_source is None:
            return None

        if not self.lowering_record['stats']['bounding_box']:
            logging.warning("No bounding box defined, can't build dive track.")
            return None

        fig_dive_track = plt.figure()
        ax_dive_track = plt.axes(projection=ccrs.PlateCarree())

        lower_left = (math.ceil(self.lowering_record['stats']['bounding_box'][1] * 2000)/2000.0, math.floor(self.lowering_record['stats']['bounding_box'][2] * 2000)/2000.0)
        upper_right = (math.floor(self.lowering_record['stats']['bounding_box'][3] * 2000)/2000.0, math.ceil(self.lowering_record['stats']['bounding_box'][0] * 2000)/2000.0)
        east_west = upper_right[0] - lower_left[0]
        south_north = upper_right[1] - lower_left[1]
        side = max(abs(east_west),abs(south_north)) * 1.1
        mid_x, mid_y = lower_left[0]+east_west/2.0, lower_left[1]+south_north/2.0  #center location

        ax_dive_track.set_extent([mid_x-side/2.0, mid_x+side/2.0, mid_y-side/2.0, mid_y+side/2.0])   # map coordinates, meters

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['descending_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['on_surface_dt']))

        dive_track_data = self.lowering_data[idx,:]

        lons = np.array([ float(lonStr[0]) if lonStr[0] else None for lonStr in dive_track_data[:,[self.lowering_data_headers.index( trackline_data_source + '.longitude_value' )]]])
        lons = lons[lons != np.array(None)]

        lats = np.array([ float(latStr[0]) if latStr[0] else None for latStr in dive_track_data[:,[self.lowering_data_headers.index( trackline_data_source + '.latitude_value' )]]])
        lats = lats[lats != np.array(None)]

        ax_dive_track.plot(lons,lats,linewidth=1,color='r',transform=ccrs.PlateCarree())

        ax_dive_track.plot(lons[0], lats[0], linestyle='none', marker="o", markersize=12, alpha=0.6, c="green", markeredgecolor="black", markeredgewidth=1)
        ax_dive_track.annotate('Start', (lons[0],lats[0]))

        ax_dive_track.plot(lons[-1], lats[-1], linestyle='none', marker="o", markersize=12, alpha=0.6, c="red", markeredgecolor="black", markeredgewidth=1)
        ax_dive_track.annotate('End', (lons[-1],lats[-1]))

        ax_dive_track.coastlines()
        ax_dive_track.gridlines(draw_labels=True, dms=False, x_inline=False, y_inline=False)

        imgdata = BytesIO()

        fig_dive_track.tight_layout()
        fig_dive_track.savefig(imgdata, format='svg')
        plt.close(fig_dive_track)
        imgdata.seek(0)

        svg_2_image_file = svg2rlg(imgdata)

        return svg_2_image_file


    def _build_downcast_ctd_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build CTD profile.")
            return None

        if not self.lowering_record['milestones']['on_bottom_dt']:
            logging.warning("No On Bottom milestone captured, can't build CTD profile.")
            return None

        logging.debug('Building downcast CTD data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['on_bottom_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_ctd_downcast, ax_ctd_downcast_1 = plt.subplots()

        ax_ctd_downcast_2 = ax_ctd_downcast_1.twiny()
        ax_ctd_downcast_3 = ax_ctd_downcast_1.twiny()

        ax_ctd_downcast_1.invert_yaxis()
        ax_ctd_downcast_1.set(ylabel='Depth [m]', title='CTD Downcast Data')
        ax_ctd_downcast_1.grid(linestyle='--')

        cond = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.cond_value' )]]]
        temp = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.temp_value' )]]]
        sal = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sal_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        ax_ctd_downcast_1.plot(sal,depth, label='Salinity', color='blue', )
        ax_ctd_downcast_1.set_xlabel(xlabel='Salinity [ppt]')
        ax_ctd_downcast_1.xaxis.label.set_color('blue')
        ax_ctd_downcast_1.tick_params(axis='x', colors='blue')

        ax_ctd_downcast_2.plot(cond,depth, label='Conductivity', color='orangered')
        ax_ctd_downcast_2.xaxis.set_ticks_position('bottom')
        ax_ctd_downcast_2.xaxis.set_label_position('bottom')
        ax_ctd_downcast_2.xaxis.label.set_color('orangered')
        ax_ctd_downcast_2.spines['bottom'].set_position(('outward', 36))
        ax_ctd_downcast_2.tick_params(axis='x', colors='orangered')
        ax_ctd_downcast_2.set_xlabel('Conductivity [S/m]')

        ax_ctd_downcast_3.plot(temp,depth, label='Temperature', color='green')
        ax_ctd_downcast_3.xaxis.set_ticks_position('bottom')
        ax_ctd_downcast_3.xaxis.set_label_position('bottom')
        ax_ctd_downcast_3.xaxis.label.set_color('green')
        ax_ctd_downcast_3.spines['bottom'].set_position(('outward', 72))
        ax_ctd_downcast_3.tick_params(axis='x', colors='green')
        ax_ctd_downcast_3.set_xlabel('Temperature [C]')

        # ax_ctd_downcast_1.legend(handles=[Conductivity, Temperature, Salinity], loc='center right')

        imgdata = BytesIO()

        fig_ctd_downcast.tight_layout()
        fig_ctd_downcast.savefig(imgdata, format='svg')
        plt.close(fig_ctd_downcast)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_upcast_ctd_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build CTD profile.")
            return None

        if not self.lowering_record['milestones']['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build CTD profile.")
            return None

        logging.debug('Building upcast CTD data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['stop_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_ctd_upcast, ax_ctd_upcast_1 = plt.subplots()

        ax_ctd_upcast_2 = ax_ctd_upcast_1.twiny()
        ax_ctd_upcast_3 = ax_ctd_upcast_1.twiny()

        ax_ctd_upcast_1.invert_yaxis()
        ax_ctd_upcast_1.set(ylabel='Depth [m]', title='CTD Upcast Data')
        ax_ctd_upcast_1.grid(linestyle='--')

        cond = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.cond_value' )]]]
        temp = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.temp_value' )]]]
        sal = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sal_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        ax_ctd_upcast_1.plot(sal,depth, label='Salinity', color='blue', )
        ax_ctd_upcast_1.set_xlabel(xlabel='Salinity [ppt]')
        ax_ctd_upcast_1.xaxis.label.set_color('blue')
        ax_ctd_upcast_1.tick_params(axis='x', colors='blue')

        ax_ctd_upcast_2.plot(cond,depth, label='Conductivity', color='orangered')
        ax_ctd_upcast_2.xaxis.set_ticks_position('bottom')
        ax_ctd_upcast_2.xaxis.set_label_position('bottom')
        ax_ctd_upcast_2.xaxis.label.set_color('orangered')
        ax_ctd_upcast_2.spines['bottom'].set_position(('outward', 36))
        ax_ctd_upcast_2.tick_params(axis='x', colors='orangered')
        ax_ctd_upcast_2.set_xlabel('Conductivity [S/m]')

        ax_ctd_upcast_3.plot(temp,depth, label='Temperature', color='green')
        ax_ctd_upcast_3.xaxis.set_ticks_position('bottom')
        ax_ctd_upcast_3.xaxis.set_label_position('bottom')
        ax_ctd_upcast_3.xaxis.label.set_color('green')
        ax_ctd_upcast_3.spines['bottom'].set_position(('outward', 72))
        ax_ctd_upcast_3.tick_params(axis='x', colors='green')
        ax_ctd_upcast_3.set_xlabel('Temperature [C]')

        imgdata = BytesIO()

        fig_ctd_upcast.tight_layout()
        fig_ctd_upcast.savefig(imgdata, format='svg')
        plt.close(fig_ctd_upcast)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_downcast_o2_data(self):

        oxygen_value_col = None
        if 'vehicleRealtimeO2Data.concentration_value' in self.lowering_data_headers:
            oxygen_value_col = 'vehicleRealtimeO2Data.concentration_value'
        elif 'vehicleRealtimeO2Data.concentration_raw_value' in self.lowering_data_headers:
            oxygen_value_col = 'vehicleRealtimeO2Data.concentration_raw_value'
        else:
            logging.warning("No O2 data captured, can't build O2 profile.")
            return None

        oxygen_corr_value_col = None
        if 'vehicleRealtimeO2Data.concentration_corr_value' in self.lowering_data_headers:
            oxygen_corr_value_col = 'vehicleRealtimeO2Data.concentration_corr_value'
        else:
            logging.warning("No corrected O2 data captured.")


        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD depth data captured, can't build O2 profile.")
            return None

        if not self.lowering_record['milestones']['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build O2 profile.")
            return None

        logging.debug('Building downcast O2 data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['on_bottom_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_o2_downcast, ax_o2_downcast = plt.subplots()

        ax_o2_downcast.invert_yaxis()
        ax_o2_downcast.set_title(label='O2 Downcast Data', pad=25)
        ax_o2_downcast.set(xlabel='Oxygen [\u03BCM]', ylabel='Depth [m]')
        ax_o2_downcast.grid(linestyle='--')

        o2 = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( oxygen_value_col )]]]
        o2_corr = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( oxygen_corr_value_col )]]] if oxygen_corr_value_col else None
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        ax_o2_downcast.plot(o2,depth, label='O2', color='blue')

        if o2_corr:
            ax_o2_downcast.plot(o2_corr,depth, label='O2 - Corrected', color='orangered')

        ax_o2_downcast.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})
        imgdata = BytesIO()

        fig_o2_downcast.tight_layout()
        fig_o2_downcast.savefig(imgdata, format='svg')
        plt.close(fig_o2_downcast)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_upcast_o2_data(self):

        oxygen_value_col = None
        if 'vehicleRealtimeO2Data.concentration_value' in self.lowering_data_headers:
            oxygen_value_col = 'vehicleRealtimeO2Data.concentration_value'
        elif 'vehicleRealtimeO2Data.concentration_raw_value' in self.lowering_data_headers:
            oxygen_value_col = 'vehicleRealtimeO2Data.concentration_raw_value'
        else:
            logging.warning("No O2 data captured, can't build O2 profile.")
            return None

        oxygen_corr_value_col = None
        if 'vehicleRealtimeO2Data.concentration_corr_value' in self.lowering_data_headers:
            oxygen_corr_value_col = 'vehicleRealtimeO2Data.concentration_corr_value'
        else:
            logging.warning("No corrected O2 data captured.")


        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD depth data captured, can't build O2 profile.")
            return None

        if not self.lowering_record['milestones']['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build O2 profile.")
            return None

        logging.debug('Building upcast O2 data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_record['milestones']['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_record['milestones']['stop_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_o2_upcast, ax_o2_upcast = plt.subplots()

        ax_o2_upcast.invert_yaxis()
        ax_o2_upcast.grid(linestyle='--')
        ax_o2_upcast.set_title(label='O2 Upcast Data', pad=25)
        ax_o2_upcast.set(xlabel='Oxygen [\u03BCM]', ylabel='Depth [m]')

        o2 = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( oxygen_value_col )]]]
        o2_corr = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( oxygen_corr_value_col )]]] if oxygen_corr_value_col else None
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        ax_o2_upcast.plot(o2,depth, label='O2', color='blue')

        if o2_corr:
            ax_o2_upcast.plot(o2_corr,depth, label='O2 - Corrected', color='orangered')

        ax_o2_upcast.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})
        imgdata = BytesIO()

        fig_o2_upcast.tight_layout()
        fig_o2_upcast.savefig(imgdata, format='svg')
        plt.close(fig_o2_upcast)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_sample_table(self):
        '''
        Build the reportlab sample table (does not include the framegrab)
        '''

        logging.info('Building %s table of sample events', self.lowering_record['lowering_id'])

        position_data_source = None
        depth_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.latitude_value' in self.lowering_data_headers:
                position_data_source = data_source
                break

            logging.warning("No %s position data captured, can't insert position data from this source.", data_source)

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't insert depth data from this source.", data_source)

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")

        sample_data = self.lowering_data[idx,:]

        if len(sample_data) == 0:
            logging.warning("No SAMPLE events captured, can't build sample table.")
            return None

        sample_table_data = [
            ['Sample ID:', 'Date/Time:', 'Location:', 'Type:', 'Position:', 'Alt:', 'CTD Data:', 'Text/Comment:']
        ]

        for row, _ in enumerate(sample_data):

            position_row_data = '%0.6f %s<br/>%0.6f %s<br/>%s %s' % (
                float(sample_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]),
                sample_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_uom')],
                float(sample_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_value')]),
                sample_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_uom')],
                sample_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_value')],
                sample_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_uom')]
            ) if position_data_source + '.latitude_value' in self.lowering_data_headers and len(sample_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]) > 0 else 'No Data'

            ctd_row_data = '%s<br/>%s<br/>%s' % (
                sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')] if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else '',
                sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')] if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else '',
                sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')] if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else ''
            )


            sample_table_data.append(
                [
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.sample_id')] if 'event_option.sample_id' in self.lowering_data_headers else '', self.sample_table_text),
                    Paragraph(datetime.fromisoformat(sample_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'), self.sample_table_text),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.storage_location')] if 'event_option.storage_location' in self.lowering_data_headers else '', self.sample_table_text),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.type')] if 'event_option.type' in self.lowering_data_headers else '', self.sample_table_text),
                    Paragraph(position_row_data, self.event_table_text),
                    Paragraph(sample_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_value')] + ' ' + sample_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_uom')] if depth_data_source + '.altitude_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(ctd_row_data, self.event_table_text),
                    Paragraph(self._build_text_comment(sample_data[row]), self.sample_table_text)
                ]
            )

        sample_table = Table(sample_table_data,
                            colWidths=[None, 1.75*cm, 1.75*cm, None, 2.4*cm, 1.4*cm, 1.7*cm, None],
                            style=[
                                ('BOX',(0,0),(-1,-1),1,colors.black),
                                ('GRID',(0,0),(-1,-1),1,colors.black),
                                ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                ('FONTSIZE',(0,0),(-1,-1),5),
                                ('LEADING',(0,0),(-1,-1),5),
                                ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey)
                            ])

        return sample_table


    def _build_free_form_table(self):
        '''
        Build the reportlab table of freeform events
        '''

        logging.info('Building %s table of free_form events', self.lowering_record['lowering_id'])

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "FREE_FORM")

        free_form_data = self.lowering_data[idx,:]

        if len(free_form_data) == 0:
            logging.warning("No FREE_FORM events captured, can't build FREE_FORM tables.")
            return list()

        position_data_source = None
        depth_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.latitude_value' in self.lowering_data_headers:
                position_data_source = data_source
                break

            logging.warning("No %s position data captured, can't instert position data from this source.", data_source)

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't instert depth data from this source.", data_source)

        free_form_table_data = [
            ['Date/Time:', 'Author', 'Position:', 'Alt:', 'CTD Data:', 'Text/Comment:']
        ]

        for row, _ in enumerate(free_form_data):

            position_row_data = '%0.6f %s<br/>%0.6f %s<br/>%s %s' % (
                float(free_form_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]),
                free_form_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_uom')],
                float(free_form_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_value')]),
                free_form_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_uom')],
                free_form_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_value')],
                free_form_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_uom')]
            ) if position_data_source + '.latitude_value' in self.lowering_data_headers and len(free_form_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]) > 0 else 'No Data'

            ctd_row_data = '%s<br/>%s<br/>%s' % (
                free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')] if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else '',
                free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')] if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else '',
                free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')] if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else ''
            )

            free_form_table_data.append(
                [
                    Paragraph(datetime.fromisoformat(free_form_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'), self.event_table_text),
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('event_author')], self.event_table_text),
                    Paragraph(position_row_data, self.event_table_text),
                    Paragraph(free_form_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_uom')] if depth_data_source + '.altitude_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(ctd_row_data, self.event_table_text),
                    # Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_uom')] if 'vehicleRealtimeO2Data.concentration_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(self._build_text_comment(free_form_data[row]), self.event_table_text)

                ]
            )

        free_form_table = Table(free_form_table_data,
                                colWidths=[1.75*cm, 1.75*cm, 2.4 * cm, 1.4 * cm, 1.7 * cm, None],
                                style=[
                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                    ('GRID',(0,0),(-1,-1),1,colors.black),
                                    ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                    ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                    ('FONTSIZE',(0,0),(-1,-1),7)
                                ])

        return free_form_table


    def _build_event_breakdown_table(self):
        '''
        Build the table that shows the breakdown of events as a percentage of
        all the events logged for that lowering.
        '''

        logging.info('Building %s event breakdown table', self.lowering_record['lowering_id'])

        (unique, counts) = np.unique(self.lowering_data[:, self.lowering_data_headers.index('event_value')], return_counts=True)
        frequencies = np.asarray((unique, counts)).T


        event_breakdown_table_data = [
            [
                Paragraph('''<b>Event Value:</b>''',self.body_text),
                Paragraph('''<b>Count:</b>''',self.body_text),
                Paragraph('''<b>%:</b>''',self.body_text)
            ]
        ]

        for row in range(len(frequencies)):

            event_breakdown_table_data.append([
                Paragraph(frequencies[row,0], self.table_text_centered),
                Paragraph('%s' % frequencies[row,1], self.table_text_centered),
                Paragraph('%0.2f' % (100 * frequencies[row,1].astype('int')/len(self.lowering_data)).round(2), self.table_text_centered)
            ])

        event_breakdown_table_data.append([
            Paragraph('<b>Total:</b>', self.table_text),
            Paragraph('<b>%d</b>' % frequencies[:,1].astype('int').sum(), self.table_text_centered),
            Paragraph('<b>100.0</b>', self.table_text_centered)
        ])



        event_breakdown_table = Table(event_breakdown_table_data, colWidths=[5*cm,1.9*cm,1.9*cm], style=[
                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                        ('GRID', (0,0),(-1,-1),1,colors.black),
                                        ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                        ('BACKGROUND', (0,-1),(-1,-1), colors.lightgrey),
                                        ('NOSPLIT', (0, 0), (-1, -1))
                                    ])

        return event_breakdown_table


    def _build_non_system_events_tables(self, exclude=[]): # pylint: disable=too-many-locals
        '''
        Build the reportlab tables for each of the event_values created from
        non-system event templates.
        '''

        logging.info('Building %s tables of events created from non-system event templates', self.lowering_record['lowering_id'])

        # event_templates = get_event_templates(system=False)
        event_templates = get_event_templates()
        event_template_values = [ template['event_value'] for template in event_templates if template['disabled'] is not True and template['event_value'] not in exclude ]
        event_template_values = list(set(event_template_values))
        event_template_values.sort()

        # event_exclude_list = ['SAMPLE', 'PROBLEM']
        # event_template_values = [ event_value for event_value in event_template_values if event_value not in event_exclude_list]

        event_value_tables_tables = list()

        position_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.latitude_value' in self.lowering_data_headers:
                position_data_source = data_source
                break

            logging.warning("No %s position data captured, can't instert position data from this source.", data_source)

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't instert depth data from this source.", data_source)

        #for each event template
        for event_template_value in event_template_values:

            template = next((template for template in filter(lambda event_template, template_value=event_template_value: event_template['event_value'] == template_value, event_templates)), None)
            # event_option_headers = ([option['event_option_name'].replace(" ", "_").lower() for option in template['event_options']])
            event_option_headers = ([col.replace('event_option.', '').replace(" ", "_").lower() for col in self.lowering_data_headers if col.startswith('event_option') and col != 'event_option.comment'])
            # logging.warning(f'{event_template_value} --> event_option_headers: {event_option_headers}')

            idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == event_template_value)

            event_value_data = self.lowering_data[idx,:]

            if len(event_value_data) == 0:
                logging.warning("No %s events captured, can't build %s tables.", event_template_value, event_template_value)
                event_value_tables_tables.append(list())
                continue

            table_header = ['Date/time', 'Author']
            col_widths = [1.75*cm, 1.75*cm]

            table_header += ['Event Options']
            col_widths += [None]

            # table_header += [event_option.replace("_", " ").capitalize() for event_option in event_option_headers]
            # col_widths += [None for event_option in event_option_headers]

            table_header += ['Position:', 'Alt:', 'CTD Data:', 'Text/Comment:']
            col_widths += [2.4 * cm, 1.4 * cm, 1.7 * cm, None]

            event_value_table_data = list()
            event_value_table_data.append(table_header)

            # for each row of event template data
            for row, _ in enumerate(event_value_data):

                event_value_table_row = list()
                event_value_table_row += [
                    Paragraph(datetime.fromisoformat(event_value_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'), self.event_table_text),
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('event_author')], self.event_table_text),
                ]

                if len(event_option_headers) > 0:

                    event_option_array = [option + ": " + event_value_data[row,self.lowering_data_headers.index('event_option.' + option)].replace(';', ', ') for option in event_option_headers if 'event_option.' + option in self.lowering_data_headers and event_value_data[row,self.lowering_data_headers.index('event_option.' + option)] != '']
                    # event_option_cols = [col[row] for col in event_value_data if col.startswith('event_option')]
                    # logging.warning(self.lowering_data_headers)
                    # logging.warning(event_option_cols)


                    event_option_text = '<br/>'.join(event_option_array)
                    event_value_table_row += [
                        Paragraph(event_option_text, self.event_table_text)
                    ]
                else:
                    event_value_table_row += [
                        Paragraph('', self.event_table_text)
                    ]

                position_row_data = '%0.6f %s<br/>%0.6f %s<br/>%s %s' % (
                    float(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]),
                    event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_uom')],
                    float(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_value')]),
                    event_value_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_uom')],
                    event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_value')],
                    event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_uom')]
                ) if position_data_source + '.latitude_value' in self.lowering_data_headers and len(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]) > 0 else 'No Data'

                ctd_row_data = '%s<br/>%s<br/>%s' % (
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')] if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else '',
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')] if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else '',
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')] if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else ''
                )

                event_value_table_row += [
                    Paragraph(position_row_data, self.event_table_text),
                    Paragraph(event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_uom')] if depth_data_source + '.altitude_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(ctd_row_data, self.event_table_text),
                    # Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_uom')] if 'vehicleRealtimeO2Data.abs_value_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(self._build_text_comment(event_value_data[row]), self.event_table_text)
                ]

                event_value_table_data.append(event_value_table_row)

            event_value_table = Table(event_value_table_data, colWidths=col_widths, style=[
                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                        ('GRID',(0,0),(-1,-1),1,colors.black),
                                        ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                        ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                        ('FONTSIZE',(0,0),(-1,-1),7)
                                    ])

            event_value_tables_tables.append(event_value_table)

        return event_value_tables_tables, event_template_values


    def _build_system_events_tables(self, exclude=[]): # pylint: disable=too-many-locals
        '''
        Build the reportlab tables for each of the event_values created from
        system event templates.
        '''

        logging.info('Building %s tables of events created from system event templates', self.lowering_record['lowering_id'])

        event_templates = get_event_templates(non_system=False)
        event_template_values = [ template['event_value'] for template in event_templates if template['disabled'] is not True and template['event_value'] not in exclude ]
        event_template_values = list(set(event_template_values))
        event_template_values.sort()

        # event_exclude_list = ['SAMPLE', 'PROBLEM']
        # event_template_values = [ event_value for event_value in event_template_values if event_value not in event_exclude_list]

        event_value_tables_tables = list()

        position_data_source = None
        depth_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.latitude_value' in self.lowering_data_headers:
                position_data_source = data_source
                break

            logging.warning("No %s position data captured, can't instert position data from this source.", data_source)

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't instert depth data from this source.", data_source)

        #for each event template
        for event_template_value in event_template_values:

            template = next((template for template in filter(lambda event_template, template_value=event_template_value: event_template['event_value'] == template_value, event_templates)), None)
            event_option_headers = ([option['event_option_name'].replace(" ", "_").lower() for option in template['event_options']])
            # logging.warning(f'{event_template_value} --> event_option_headers: {event_option_headers}')

            idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == event_template_value)

            event_value_data = self.lowering_data[idx,:]

            if len(event_value_data) == 0:
                logging.warning("No %s events captured, can't build %s tables.", event_template_value, event_template_value)
                event_value_tables_tables.append(list())
                continue

            table_header = ['Date/time', 'Author']
            col_widths = [1.75*cm, 1.75*cm]

            table_header += ['Event Options']
            col_widths += [None]

            # table_header += [event_option.replace("_", " ").capitalize() for event_option in event_option_headers]
            # col_widths += [None for event_option in event_option_headers]

            table_header += ['Position:', 'Alt:', 'CTD Data:', 'Text/Comment:']
            col_widths += [2.4 * cm, 1.4 * cm, 1.7 * cm, None]

            event_value_table_data = list()
            event_value_table_data.append(table_header)

            # for each row of event template data
            for row, _ in enumerate(event_value_data):

                event_value_table_row = list()
                event_value_table_row += [
                    Paragraph(datetime.fromisoformat(event_value_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'), self.event_table_text),
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('event_author')], self.event_table_text),
                ]

                if len(event_option_headers) > 0:

                    event_option_array = [option + ": " + event_value_data[row,self.lowering_data_headers.index('event_option.' + option)] for option in event_option_headers if 'event_option.' + option in self.lowering_data_headers and event_value_data[row,self.lowering_data_headers.index('event_option.' + option)] != '']
    
                    event_option_text = '<br/>'.join(event_option_array)
                    event_value_table_row += [
                        Paragraph(event_option_text, self.event_table_text)
                    ]
                else:
                    event_value_table_row += [
                        Paragraph('', self.event_table_text)
                    ]

                position_row_data = '%0.6f %s<br/>%0.6f %s<br/>%s %s' % (
                    float(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]),
                    event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_uom')],
                    float(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_value')]),
                    event_value_data[row,self.lowering_data_headers.index(position_data_source + '.longitude_uom')],
                    event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_value')],
                    event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.depth_uom')]
                ) if position_data_source + '.latitude_value' in self.lowering_data_headers and len(event_value_data[row,self.lowering_data_headers.index(position_data_source + '.latitude_value')]) > 0 else 'No Data'

                ctd_row_data = '%s<br/>%s<br/>%s' % (
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')] if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else '',
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')] if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else '',
                    event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')] if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else ''
                )

                event_value_table_row += [
                    Paragraph(position_row_data, self.event_table_text),
                    Paragraph(event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index(depth_data_source + '.altitude_uom')] if depth_data_source + '.altitude_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(ctd_row_data, self.event_table_text),
                    # Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.concentration_uom')] if 'vehicleRealtimeO2Data.abs_value_value' in self.lowering_data_headers else 'No Data', self.event_table_text),
                    Paragraph(self._build_text_comment(event_value_data[row]), self.event_table_text)
                ]

                event_value_table_data.append(event_value_table_row)

            event_value_table = Table(event_value_table_data, colWidths=col_widths, style=[
                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                        ('GRID',(0,0),(-1,-1),1,colors.black),
                                        ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                        ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                        ('FONTSIZE',(0,0),(-1,-1),7)
                                    ])

            event_value_tables_tables.append(event_value_table)

        return event_value_tables_tables, event_template_values


    def _build_events_table(self): # pylint: disable=too-many-locals
        '''
        Build the table that displays all the events.
        '''

        logging.info('Building %s table of events', self.lowering_record['lowering_id'])

        position_data_source = None
        depth_data_source = None

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                position_data_source = data_source
                break

            logging.warning("No %s position data captured, can't instert position data from this source.", data_source)

        for data_source in POS_DATA_SOURCES:
            if data_source + '.depth_value' in self.lowering_data_headers:
                depth_data_source = data_source
                break

            logging.warning("No %s depth data captured, can't instert depth data from this source.", data_source)

        event_exclude_list = ['ASNAP']

        table_header = ['Event', 'Date/time', 'Author', 'Postion', 'Depth', 'Text/Comment:']

        event_table_data = list()
        event_table_data.append(table_header)

        for event in self.lowering_data:
            if event[self.lowering_data_headers.index('event_value')] in event_exclude_list:
                continue

            position = event[self.lowering_data_headers.index(position_data_source + '.latitude_value')] if position_data_source + '.latitude_value' in self.lowering_data_headers else 'No Data'
            position += ','
            position += event[self.lowering_data_headers.index(position_data_source + '.longitude_value')] if position_data_source + '.longitude_value' in self.lowering_data_headers else 'No Data'
            position = '' if position == ',' else position

            event_table_data.append([
                Paragraph(event[self.lowering_data_headers.index('event_value')], self.sample_table_text),
                Paragraph(datetime.fromisoformat(event[self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%dT%H:%M:%S'), self.sample_table_text),
                Paragraph(event[self.lowering_data_headers.index('event_author')], self.sample_table_text),
                Paragraph('%0.6f %s\n%0.6f %s' % (float(event[self.lowering_data_headers.index(position_data_source + '.latitude_value')]), event[self.lowering_data_headers.index(position_data_source + '.latitude_uom')], float(event[self.lowering_data_headers.index(position_data_source + '.longitude_value')]), event[self.lowering_data_headers.index(position_data_source + '.longitude_uom')]) if position_data_source + '.latitude_value' in self.lowering_data_headers and len(event[self.lowering_data_headers.index(position_data_source + '.latitude_value')]) > 0 else 'No Data', self.sample_table_text),
                Paragraph(event[self.lowering_data_headers.index(depth_data_source + '.depth_value')] + ' ' + event[self.lowering_data_headers.index(depth_data_source + '.depth_uom')], self.sample_table_text) if depth_data_source + '.depth_value' in self.lowering_data_headers else 'No Data',
                Paragraph(self._build_text_comment(event_value_data[row]), self.sample_table_text)
            ])

        event_table = Table(event_table_data, colWidths=[2*cm,2.2*cm,1.8*cm,3*cm,1.5*cm,5.5*cm], style=[
                            ('BOX',(0,0),(-1,-1),1,colors.black),
                            ('GRID',(0,0),(-1,-1),1,colors.black),
                            ('VALIGN',(0,0),(-1,-1), 'TOP'),
                            ('FONTSIZE',(0,0),(-1,-1),5),
                            ('LEADING',(0,0),(-1,-1),5),
                            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey)
                        ])

        return event_table


    def _build_watch_change_table(self):

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]

        if len(watch_change_data) == 0:
            logging.warning("No WATCH CHANGE events captured, can't build watch change table.")
            return None

        logging.debug('Building watch_change tables')

        watch_change_table_data = [
            [
                Paragraph('''<b>Date/Time:</b>''',self.body_text),
                Paragraph('''<b>Pilot:</b>''',self.body_text),
                Paragraph('''<b>Co-Pilot:</b>''',self.body_text),
                Paragraph('''<b>Datalogger:</b>''',self.body_text)
            ]
        ]

        pilot_index = self.lowering_data_headers.index('event_option.pilot') if 'event_option.pilot' in self.lowering_data_headers else -1
        copilot_index = self.lowering_data_headers.index('event_option.co-pilot') if 'event_option.co-pilot' in self.lowering_data_headers else -1
        datalogger_index = self.lowering_data_headers.index('event_option.datalogger') if 'event_option.datalogger' in self.lowering_data_headers else -1

        for row in range(len(watch_change_data)):

            pilot_data = watch_change_data[row,pilot_index] if pilot_index >= 0 else None
            copilot_data = watch_change_data[row,copilot_index] if copilot_index >= 0 else None
            datalogger_data = watch_change_data[row,datalogger_index] if datalogger_index >= 0 else None


            watch_change_table_data.append([
                watch_change_data[row,self.lowering_data_headers.index('ts')].astype('datetime64[m]'),
                pilot_data,
                copilot_data,
                datalogger_data
            ])

        watch_change_table = Table(watch_change_table_data, style=[
                                                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                                                    ('LINEAFTER',(0,0),(-1,-1),1,colors.black),
                                                                    ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                                                    ('BACKGROUND', (0,0),(-1,0), colors.lightgrey)
                                                                    #('NOSPLIT', (0, 0), (-1, -1))
                                                                  ])

        watch_change_table._argW[0]=4 * cm
        watch_change_table._argW[1]=2.5 * cm
        watch_change_table._argW[2]=2.5 * cm
        watch_change_table._argW[3]=2.5 * cm

        return watch_change_table


    def _build_watch_change_chart(self):

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]

        if len(watch_change_data) == 0:
            logging.warning("No WATCH CHANGE events captured, can't build watch change chart.")
            return None

        logging.debug('Building watch_change graphs')

        pilot_index = self.lowering_data_headers.index('event_option.pilot') if 'event_option.pilot' in self.lowering_data_headers else -1
        copilot_index = self.lowering_data_headers.index('event_option.co-pilot') if 'event_option.co-pilot' in self.lowering_data_headers else -1
        datalogger_index = self.lowering_data_headers.index('event_option.datalogger') if 'event_option.datalogger' in self.lowering_data_headers else -1

        col_names = list(['id','ts','event_option.pilot','event_option.co-pilot','event_option.datalogger'])
        cols = np.array([header_name in col_names for header_name in self.lowering_data_headers])

        pilots = np.array('')
        if pilot_index >= 0:
            pilots = np.unique(watch_change_data[:, pilot_index])

        pilots = pilots[pilots != np.array('')]

        co_pilots = np.array('')
        if copilot_index >= 0:
            co_pilots = np.unique(watch_change_data[:, copilot_index])

        co_pilots = co_pilots[co_pilots != np.array('')]

        dataloggers = np.array('')
        if datalogger_index >= 0:
            dataloggers = np.unique(watch_change_data[:, datalogger_index])

        dataloggers = dataloggers[dataloggers != np.array('')]

        operators = np.concatenate((pilots, co_pilots, dataloggers))
        operators = np.unique(operators)

        operators = np.reshape(operators, (-1, 1))
        seconds = np.zeros((len(operators),4))

        hack = watch_change_data[0:,cols]

        if pilot_index < 0:
            hack = np.insert(hack, col_names.index('event_option.pilot'), '', axis=1)

        if copilot_index < 0:
            hack = np.insert(hack, col_names.index('event_option.co-pilot'), '', axis=1)

        if datalogger_index < 0:
            hack = np.insert(hack, col_names.index('event_option.datalogger'), '', axis=1)

        manhours = pd.DataFrame(data=hack, # values
            index=hack[0:,0],              # 1st column as index
            columns=col_names)             # column names

        manhours['ts'] = pd.to_datetime(manhours['ts'], utc=True) # transfrom string to datetime
        manhours['time_diff'] = 0

        for i in range(manhours.shape[0]-1):
            manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

        manhours['time_diff'][-1] = (self.lowering_record['milestones']['stop_dt'] - manhours['ts'][-1]).total_seconds()

        for row in range(len(seconds)):

            seconds[row,0] = manhours.loc[manhours['event_option.pilot'] == operators[row,0], 'time_diff'].sum()
            seconds[row,1] = manhours.loc[manhours['event_option.co-pilot'] == operators[row,0], 'time_diff'].sum()
            seconds[row,2] = manhours.loc[manhours['event_option.datalogger'] == operators[row,0], 'time_diff'].sum()

        fig_watch_change, ax_watch_change = plt.subplots(figsize=(7,4.5))
        ax_watch_change.set_title(label='Operator Working Hours', pad=25)

        pilots = ax_watch_change.bar(operators[:,0],seconds[:,2], label='Pilot')
        co_pilots = ax_watch_change.bar(operators[:,0],seconds[:,0], label='Co-Pilot', bottom=seconds[:,2])
        dataloggers = ax_watch_change.bar(operators[:,0],seconds[:,1], label='Datalogger', bottom=seconds[:,0])

        ax_watch_change.yaxis.set_major_locator(ticker.MultipleLocator(60*60))
        ax_watch_change.yaxis.set_minor_locator(ticker.MultipleLocator(60*15))
        ax_watch_change.yaxis.set_major_formatter(ticker.FuncFormatter(seconds_to_hours_formatter))
        ax_watch_change.yaxis.grid(linestyle='--')

        ax_watch_change.set(ylabel='Hours')
        ax_watch_change.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_watch_change.tight_layout()
        fig_watch_change.savefig(imgdata, format='svg')
        plt.close(fig_watch_change)
        imgdata.seek(0)

        svg_2_img_file = svg2rlg(imgdata)

        return svg_2_img_file


    def _build_watch_change_summary_table(self):

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]

        if len(watch_change_data) == 0:
            logging.warning("No WATCH CHANGE events captured, can't build watch sumary table.")
            return None

        logging.debug('Building watch_change summary table')

        pilot_index = self.lowering_data_headers.index('event_option.pilot') if 'event_option.pilot' in self.lowering_data_headers else -1
        copilot_index = self.lowering_data_headers.index('event_option.co-pilot') if 'event_option.co-pilot' in self.lowering_data_headers else -1
        datalogger_index = self.lowering_data_headers.index('event_option.datalogger') if 'event_option.datalogger' in self.lowering_data_headers else -1

        col_names = list(['id','ts','event_option.pilot','event_option.co-pilot','event_option.datalogger'])
        cols = np.array([header_name in col_names for header_name in self.lowering_data_headers])

        pilots = np.array('')
        if pilot_index >= 0:
            pilots = np.unique(watch_change_data[:, pilot_index])

        pilots = pilots[pilots != np.array('')]
        pilot_hours = np.stack((pilots, np.zeros([len(pilots)])), axis=1)

        co_pilots = np.array('')
        if copilot_index >= 0:
            co_pilots = np.unique(watch_change_data[:, copilot_index])

        co_pilots = co_pilots[co_pilots != np.array('')]
        co_pilot_hours = np.stack((co_pilots, np.zeros([len(co_pilots)])), axis=1)

        dataloggers = np.array('')
        if datalogger_index >= 0:
            dataloggers = np.unique(watch_change_data[:, datalogger_index])

        dataloggers = dataloggers[dataloggers != np.array('')]
        datalogger_hours = np.stack((dataloggers, np.zeros([len(dataloggers)])), axis=1)

        operators = np.concatenate((pilots, co_pilots, dataloggers))
        operators = np.unique(operators)

        operator_hours = np.column_stack((operators, np.zeros((len(operators),5))))

        hack = watch_change_data[0:,cols]

        if pilot_index < 0:
            hack = np.insert(hack, col_names.index('event_option.pilot'), '', axis=1)

        if copilot_index < 0:
            hack = np.insert(hack, col_names.index('event_option.co-pilot'), '', axis=1)

        if datalogger_index < 0:
            hack = np.insert(hack, col_names.index('event_option.datalogger'), '', axis=1)

        manhours = pd.DataFrame(data=hack,  # values
                                index=hack[0:,0],    # 1st column as index
                                columns=col_names)                # column names

        manhours['ts'] = pd.to_datetime(manhours['ts'], utc=True) # transfrom string to datetime
        manhours['time_diff'] = 0

        for i in range(manhours.shape[0]-1):
            manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

        manhours['time_diff'][-1] = (self.lowering_record['milestones']['stop_dt'] - manhours['ts'][-1]).total_seconds()

        for row in range(len(pilot_hours)):
            pilot_hours[row,1] = manhours.loc[manhours['event_option.pilot'] == pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')

        for row in range(len(co_pilot_hours)):
            co_pilot_hours[row,1] = manhours.loc[manhours['event_option.co-pilot'] == co_pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')

        for row in range(len(datalogger_hours)):
            datalogger_hours[row,1] = manhours.loc[manhours['event_option.datalogger'] == datalogger_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')

        for row in range(len(operator_hours)):
            operator_hours[row,1] = manhours.loc[manhours['event_option.pilot'] == operator_hours[row,0], 'time_diff'].sum()
            operator_hours[row,2] = manhours.loc[manhours['event_option.co-pilot'] == operator_hours[row,0], 'time_diff'].sum()
            operator_hours[row,3] = manhours.loc[manhours['event_option.datalogger'] == operator_hours[row,0], 'time_diff'].sum()
            operator_hours[row,5] = np.sum(operator_hours[row,1:5].astype('float'))

        watch_change_table_data = [
           [
            '',
            Paragraph('''<b>Pilot:</b>''',self.body_text),
            Paragraph('''<b>Co-Pilot:</b>''',self.body_text),
            Paragraph('''<b>Datalogger:</b>''',self.body_text),
            Paragraph('''<b>Total:</b>''',self.body_text)],
        ]

        for row in range(len(operator_hours)):

            watch_change_table_data.append([
                operator_hours[row,0],
                strfdelta(datetime.utcfromtimestamp(operator_hours[row,3].astype('float')) - datetime.fromisoformat('1970-01-01')),
                strfdelta(datetime.utcfromtimestamp(operator_hours[row,1].astype('float')) - datetime.fromisoformat('1970-01-01')),
                strfdelta(datetime.utcfromtimestamp(operator_hours[row,2].astype('float')) - datetime.fromisoformat('1970-01-01')),
                strfdelta(datetime.utcfromtimestamp(operator_hours[row,5].astype('float')) - datetime.fromisoformat('1970-01-01')),
            ])

            watch_change_summary_table = Table(watch_change_table_data, style=[
                                                                                ('BOX',(0,1),(0,-1),1,colors.black),
                                                                                ('GRID',(0,1),(0,-1),1,colors.black),
                                                                                ('BOX',(1,0),(-1,-1),1,colors.black),
                                                                                ('GRID',(1,0),(-1,-1),1,colors.black),
                                                                                ('BACKGROUND', (1,0),(-1,0), colors.lightgrey),
                                                                                ('NOSPLIT', (0, 0), (-1, -1))
                                                                              ])

            watch_change_summary_table._argW[0]=2.5 * cm
            watch_change_summary_table._argW[1]=3.18 * cm
            watch_change_summary_table._argW[2]=3.18 * cm
            watch_change_summary_table._argW[3]=3.18 * cm
            watch_change_summary_table._argW[4]=3.18 * cm

        return watch_change_summary_table


    def _build_problem_tables(self):
        '''
        Build the reportlab table for the problem events.
        '''

        logging.info('Building %s table of problem events', self.lowering_record['lowering_id'])

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "PROBLEM")

        problem_data = self.lowering_data[idx,:]

        if len(problem_data) == 0:
            logging.warning("No PROBLEM events captured, can't build problem table.")
            return list()

        problem_tables = []


        for row in range(len(problem_data)):

            problem_table_data = [
                [
                    'Date/Time:',
                    'Type:',
                    'Text/Comment:'
                ],
                [
                    Paragraph(datetime.fromisoformat(problem_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'), self.body_text),
                    Paragraph(problem_data[row,self.lowering_data_headers.index('event_option.type')], self.body_text),
                    Paragraph(self._build_text_comment(problem_data[row]), self.body_text)                ]
            ]

            problem_table = Table(problem_table_data, colWidths=[2.5*cm,2.5*cm,None], style=[
                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                    ('GRID',(0,0),(-1,-1),1,colors.black),
                                    ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                    ('NOSPLIT', (0, 0), (-1, -1)),
                                    ('VALIGN',(0,0),(-1,-1),'TOP')
                                 ])

            problem_tables.append(problem_table)

        return problem_tables
