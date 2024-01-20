#!/usr/bin/env python3
'''
FILE:           sealog_build_lowering_vehicle_report.py

DESCRIPTION:    Build the lowering vehicle report.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-05-03
REVISION:   2023-04-07

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import os
import sys
import math
import logging
import tempfile
from io import BytesIO
from datetime import datetime

import matplotlib.dates as mdates
import matplotlib.pyplot as plt

import numpy as np

import pandas as pd

from reportlab.platypus import Image, NextPageTemplate, PageBreak, Paragraph, Spacer, Table
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm

from svglib.svglib import svg2rlg

from os.path import dirname, realpath
sys.path.append(dirname(dirname(dirname(realpath(__file__)))))

from misc.reporting.sealog_doc_template_Sub import RLDocTemplate
from misc.reporting.sealog_report_builder_Sub import LoweringReportCreator

from misc.python_sealog.settings import API_SERVER_FILE_PATH
from misc.python_sealog.lowerings import get_lowering_uid_by_id

PAGE_SIZE = A4
PAGE_WIDTH, PAGE_HEIGHT= PAGE_SIZE
BASE_MARGIN = 1 * cm

AUTHOR = "Schmidt Ocean Institute"
VEHICLE_NAME = 'SuBastian'

# BASE_MARGIN = 5 * mm

# CRUISE_DATA_ROOT = '/mnt/soi_data1/vault/CruiseData'
CROPPED_DATA_DIR = '/data/sealog_Sub_cropped_data'
# CRUISE_DATA_ROOT = '/Users/webbpinner/Desktop/CruiseData'
pd.set_option('mode.chained_assignment', None)

class LoweringVehicleReport(LoweringReportCreator):

    def _build_vehicle_comp_datafile(self):

        logging.debug("Pulling vehicle compensator data from Data Warehouse")

        path = os.path.join(CROPPED_DATA_DIR, self.cruise_record['cruise_id'],self.cruise_record['cruise_id'] + "_" + self.lowering_record['lowering_id'], "OpenRVDAS")
        #path = os.path.join(CRUISE_DATA_ROOT, self.cruise_record['cruise_id'], 'Vehicles', 'SuBastian', self.cruise_record['cruise_id'] + '_' + self.lowering_record['lowering_id'], 'OpenRVDAS')
        filename = self.cruise_record['cruise_id'] + '_sb_mech_comps_' + self.lowering_record['lowering_id'] + '.txt'
        all_filenames = [os.path.join(path, filename)]
        # all_filenames.sort()
        # logging.debug(path + '/' + prefix + '*.' + extension)
        # logging.debug("Files: " + ", ".join(all_filenames))

        fd, comp_data_file = tempfile.mkstemp(suffix=".csv", dir=self.tmp_dir)

        try:
            with(open(comp_data_file, 'w+')) as comb_fp:
                # Timestamp,Header,Comp1_%,Comp2_%,Comp3_%,Comp4_%,Comp5_%,Comp6_%
                # comb_fp.write("date_time,hdr,comp1,comp2,comp3,comp4,comp5,comp6\n")

                for f in all_filenames:
                    with(open(f, 'r')) as fp:
                        comb_fp.write(fp.read())
            
            return comp_data_file
        except:
            return None


    def _import_comp_data(self, comp_file):

        logging.debug("Importing data into numpy array")

        comp_data = pd.read_csv(comp_file)
        # comp_data['Timestamp'] = pd.to_datetime(comp_data['date'] + ' ' + comp_data['time'], infer_datetime_format=True)
        comp_data['Timestamp'] = pd.to_datetime(comp_data['Timestamp'], utc=True)

        mask = (comp_data['Timestamp'] >= self.lowering_record['milestones']['start_dt']) & (comp_data['Timestamp'] <= self.lowering_record['milestones']['stop_dt'])
        comp_data = comp_data.loc[mask]

        return list(comp_data.columns), comp_data.to_numpy()


    def _build_comp_data_dive_summary(self, comp_data_headers, comp_data):

        if comp_data is None or len(comp_data) == 0:
            logging.warning("No comp data captured, can't build comp data dive summary table.")
            return None

        logging.debug('Building comp data dive summary table')

        comp_data_dive_summary_data = [
            [
                'Compensators (Entire Dive)',
                '',
                '',
                ''
            ],
            [
                'Compensator',
                'Deployed Value',
                'Recovered Value',
                'Difference'
            ],
            [
                'Main Res (Comp 1)',
                round(comp_data[0][comp_data_headers.index('Comp1_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp1_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp1_%')] - comp_data[0][comp_data_headers.index('Comp1_%')],4)
            ],
            [
                'Thrusters (Comp 2)',
                round(comp_data[0][comp_data_headers.index('Comp2_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp2_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp2_%')] - comp_data[0][comp_data_headers.index('Comp2_%')],4)
            ],
            [
                'Term (Comp 3)',
                round(comp_data[0][comp_data_headers.index('Comp3_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp3_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp3_%')] - comp_data[0][comp_data_headers.index('Comp3_%')],4)
            ],
            [
                'Submotor (Comp 4)',
                round(comp_data[0][comp_data_headers.index('Comp4_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp4_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp4_%')] - comp_data[0][comp_data_headers.index('Comp4_%')],4)
            ],
            [
                'Elec Box (Comp 5)',
                round(comp_data[0][comp_data_headers.index('Comp5_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp5_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp5_%')] - comp_data[0][comp_data_headers.index('Comp5_%')],4)
            ],
            [
                'Manip (Comp 6)',
                round(comp_data[0][comp_data_headers.index('Comp6_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp6_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp6_%')] - comp_data[0][comp_data_headers.index('Comp6_%')],4)
            ]
        ]

        comp_data_dive_summary_table = Table(comp_data_dive_summary_data, style=[
                                                ('BOX',(0,1),(-1,-1),.5,colors.black),
                                                ('GRID',(0,1),(-1,-1),.5,colors.black),
                                                ('SPAN',(0,0),(-1,0)),
                                                ('FONTSIZE',(0,0),(0,0),14),
                                                ('FONTNAME',(0,0),(0,0),'Helvetica-Bold'),
                                                ('BOTTOMPADDING',(0,0),(0,0),14),
                                                ('NOSPLIT', (0, 0), (-1, -1)),
                                                ('BACKGROUND', (0, 1), (-1, 1), colors.lightgrey)
                                            ])

        return comp_data_dive_summary_table


    def _build_comp_data_on_bottom(self, comp_data_headers, comp_data):

        if comp_data is None or len(comp_data) == 0:
            logging.warning("No comp data captured, can't build comp on bottom table.")
            return None

        if not self.lowering_record['milestones']['on_bottom_dt'] or not self.lowering_record['milestones']['off_bottom_dt']:
            logging.warning("No On/Off Bottom milestones captured, can't build on bottom compensator stats.")
            return None
        
        mask = (comp_data[:,comp_data_headers.index('Timestamp')] >= self.lowering_record['milestones']['on_bottom_dt']) & (comp_data[:,comp_data_headers.index('Timestamp')] < self.lowering_record['milestones']['off_bottom_dt'])
        comp_data = comp_data[mask]

        logging.debug('Building comp data on bottom table')

        comp_data_on_bottom_data = [
            [
                'Compensators (On Bottom/@ Target Depth)',
                '',
                '',
                ''
            ],
            [
                'Compensator',
                'On Bottom Value',
                'Off Bottom Value',
                'Difference'
            ],
            [
                'Main Res (Comp 1)',
                round(comp_data[0][comp_data_headers.index('Comp1_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp1_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp1_%')] - comp_data[0][comp_data_headers.index('Comp1_%')],4)
            ],
            [
                'Thrusters (Comp 2)',
                round(comp_data[0][comp_data_headers.index('Comp2_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp2_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp2_%')] - comp_data[0][comp_data_headers.index('Comp2_%')],4)
            ],
            [
                'Term (Comp 3)',
                round(comp_data[0][comp_data_headers.index('Comp3_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp3_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp3_%')] - comp_data[0][comp_data_headers.index('Comp3_%')],4)
            ],
            [
                'Submotor (Comp 4)',
                round(comp_data[0][comp_data_headers.index('Comp4_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp4_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp4_%')] - comp_data[0][comp_data_headers.index('Comp4_%')],4)
            ],
            [
                'Elec. Box(Comp 5)',
                round(comp_data[0][comp_data_headers.index('Comp5_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp5_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp5_%')] - comp_data[0][comp_data_headers.index('Comp5_%')],4)
            ],
            [
                'Manip (Comp 6)',
                round(comp_data[0][comp_data_headers.index('Comp6_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp6_%')],4),
                round(comp_data[-1][comp_data_headers.index('Comp6_%')] - comp_data[0][comp_data_headers.index('Comp6_%')],4)
            ]
        ]

        comp_data_on_bottom_table = Table(comp_data_on_bottom_data, style=[
                                                ('BOX',(0,1),(-1,-1),.5,colors.black),
                                                ('GRID',(0,1),(-1,-1),.5,colors.black),
                                                ('SPAN',(0,0),(-1,0)),
                                                ('FONTSIZE',(0,0),(0,0),14),
                                                ('FONTNAME',(0,0),(0,0),'Helvetica-Bold'),
                                                ('BOTTOMPADDING',(0,0),(0,0),14),
                                                ('NOSPLIT', (0, 0), (-1, -1)),
                                                ('BACKGROUND', (0, 1), (-1, 1), colors.lightgrey)
                                            ])

        return comp_data_on_bottom_table


    def _build_comp_data_plot(self, comp_data_headers, comp_data):

        if comp_data is None or len(comp_data) == 0:
            logging.warning("No comp data captured, can't build comp data plot.")
            return None

        logging.debug('Building comp data plot')

        start_ts = next((ts[0] for ts in comp_data[:,[comp_data_headers.index( 'Timestamp' )]].astype(datetime) if ts is not None), None)

        fig_comp, ax_comp_1 = plt.subplots(figsize=(8, 4.5))

        ax_comp_1.set_title(label='Compensator Pressure Data', pad=30)
        ax_comp_1.set(xlabel='Time', ylim=(0, 100))
        ax_comp_1.grid(linestyle='--') 

        ax_comp_1.xaxis.set_major_locator(mdates.HourLocator(interval=4))
        formatter = mdates.DateFormatter("%H:00")
        ax_comp_1.xaxis.set_major_formatter(formatter)

        x_ts = [ datetime.utcfromtimestamp((tsStr[0] - start_ts).total_seconds()) for tsStr in comp_data[:,[comp_data_headers.index( 'Timestamp' )]].astype(datetime)]

        comp_data_1 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp1_%' )]]]
        comp_data_2 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp2_%' )]]]
        comp_data_3 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp3_%' )]]]
        comp_data_4 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp4_%' )]]]
        comp_data_5 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp5_%' )]]]
        comp_data_6 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'Comp6_%' )]]]

        Comp_1, = ax_comp_1.plot(x_ts, comp_data_1, label='Main Res\n(Comp 1)', color='blue', linewidth=1)
        Comp_2, = ax_comp_1.plot(x_ts, comp_data_2, label='Thrusters\n(Comp 2)', color='orange', linewidth=1)
        Comp_3, = ax_comp_1.plot(x_ts, comp_data_3, label='Term\n(Comp 3)', color='green', linewidth=1)
        Comp_4, = ax_comp_1.plot(x_ts, comp_data_4, label='Submotor\n(Comp 4)', color='red', linewidth=1)
        Comp_5, = ax_comp_1.plot(x_ts, comp_data_5, label='Elec. Bo\n(Comp 5)', color='purple', linewidth=1)
        Comp_6, = ax_comp_1.plot(x_ts, comp_data_6, label='Manip\n(Comp 6)', color='gray', linewidth=1)


        if 'vehicleRealtimeCTDData.depth_value' in self.lowering_data_headers:

            start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

            if not start_ts:
                return None

            ax_comp_2 = ax_comp_1.twinx()
            ax_comp_3 = ax_comp_1.twinx()

            ax_comp_2.xaxis.set_major_locator(mdates.HourLocator(interval=4))
            formatter = mdates.DateFormatter("%H:00")
            ax_comp_2.xaxis.set_major_formatter(formatter)

            ax_comp_3.xaxis.set_major_locator(mdates.HourLocator(interval=4))
            formatter = mdates.DateFormatter("%H:00")
            ax_comp_3.xaxis.set_major_formatter(formatter)

            x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
            ctd_depth_data = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]
            ctd_temp_data = [ float(tempStr[0]) if tempStr[0] else None for tempStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.temp_value' )]]]

            CTD_Depth = ax_comp_2.plot(x_ts,ctd_depth_data, label='Depth', color='deepskyblue', linewidth=1, linestyle="dashed")
            ax_comp_2.set(ylabel='Depth [m]')
            ax_comp_2.yaxis.label.set_color('deepskyblue')
            ax_comp_2.tick_params(axis='y', colors='deepskyblue')
            ax_comp_2.invert_yaxis()

            CTD_Temp = ax_comp_3.plot(x_ts,ctd_temp_data, label='Temperature', color='limegreen', linewidth=1, linestyle="dashdot")
            ax_comp_3.set(ylabel='Temperature [C]')
            ax_comp_3.yaxis.label.set_color('limegreen')
            ax_comp_3.yaxis.set_ticks_position('right')
            ax_comp_3.tick_params(axis='y', colors='limegreen')
            ax_comp_3.yaxis.set_label_position('right')
            ax_comp_3.spines['right'].set_position(('outward', 50))

        else:
            logging.warning("No CTD data captured, can't build add depth and temp profiles.")

        ax_comp_1.legend(handles=[Comp_1,Comp_2,Comp_3,Comp_4,Comp_5,Comp_6], loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=6, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_comp.tight_layout()
        fig_comp.savefig(imgdata, format='svg')
        plt.close(fig_comp)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def export_pdf(self): # pylint: disable=too-many-locals,too-many-statements,too-many-branches
        '''
        Export report to pdf data
        '''

        report_buffer = BytesIO()

        doc = RLDocTemplate(
            report_buffer,
            pagesize=PAGE_SIZE,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Dive Vehicle Report: " + self.lowering_record['lowering_id'],
            subtitle="Remotely Operated Vehicle: " + VEHICLE_NAME,
            author=AUTHOR
        )

        stat_table = self._build_stat_table()
        summary_table = self._build_summary_table()
        watch_change_table = self._build_watch_change_table()
        watch_change_summary_table = self._build_watch_change_summary_table()
        problem_tables = self._build_problem_tables()

        comp_datafile = self._build_vehicle_comp_datafile()
        if comp_datafile:
            comp_data_headers, comp_data = self._import_comp_data(comp_datafile)

            comp_data_dive_summary_table = self._build_comp_data_dive_summary(comp_data_headers, comp_data)
            comp_data_on_bottom_table = self._build_comp_data_on_bottom(comp_data_headers, comp_data)

            comp_data_plot_filename = self._build_comp_data_plot(comp_data_headers, comp_data)

            if comp_data_plot_filename:
                comp_data_plot = Image(comp_data_plot_filename)
                comp_data_plot._restrictSize(PAGE_WIDTH - 2.5 * cm, 15 * cm)
                comp_data_plot.hAlign = 'CENTER'

        depths_plot_filename = self._build_depths_plot()
        if depths_plot_filename:
            depths_plot = Image(depths_plot_filename)
            depths_plot._restrictSize(PAGE_WIDTH - 5 * cm, PAGE_HEIGHT - 5 * cm)
            depths_plot.hAlign = 'CENTER'

        downcast_ctd_data_filename = self._build_downcast_ctd_data()
        if downcast_ctd_data_filename:
            downcast_ctd_data = Image(downcast_ctd_data_filename)
            downcast_ctd_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            downcast_ctd_data.hAlign = 'CENTER'

        upcast_ctd_data_filename = self._build_upcast_ctd_data()
        if upcast_ctd_data_filename:
            upcast_ctd_data = Image(upcast_ctd_data_filename)
            upcast_ctd_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            upcast_ctd_data.hAlign = 'CENTER'

        downcast_o2_data_filename = self._build_downcast_o2_data()
        if downcast_o2_data_filename:
            downcast_o2_data = Image(downcast_o2_data_filename)
            downcast_o2_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            downcast_o2_data.hAlign = 'CENTER'

        upcast_o2_data_filename = self._build_upcast_o2_data()
        if upcast_o2_data_filename:
            upcast_o2_data = Image(upcast_o2_data_filename)
            upcast_o2_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            upcast_o2_data.hAlign = 'CENTER'

        watch_change_filename = self._build_watch_change_chart()
        if watch_change_filename:
            watch_change_plot = Image(watch_change_filename)
            watch_change_plot._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            watch_change_plot.hAlign = 'CENTER'

        depth_plot_filename = self._build_depth_plot()
        if depth_plot_filename:
            depth_plot = Image(depth_plot_filename)
            depth_plot._restrictSize(PAGE_WIDTH -5 * cm, 10 * cm) # pylint: disable=protected-access
            depth_plot.hAlign = 'CENTER'

        dive_track_filename = self._build_dive_track()
        if dive_track_filename:
            dive_track = Image(dive_track_filename)
            dive_track._restrictSize(PAGE_WIDTH - 5 * cm, PAGE_HEIGHT - 5 * cm) # pylint: disable=protected-access
            dive_track.hAlign = 'CENTER'

        toc = TableOfContents()
        toc.levelStyles = [ self.toc_heading_1, self.toc_heading_2 ]

        logging.debug("Building flowables array")

        flowables = []

        flowables.append(NextPageTemplate('Normal'))
        # flowables.append(Paragraph("Cruise Summary:", self.coverHeader)),
        # flowables.append(Paragraph("<b>Cruise ID:</b> " + self.cruise_record['cruise_id'], self.body_text)),
        # flowables.append(Paragraph("<b>Cruise PI:</b> " + cruise_location, self.body_text)),
        # flowables.append(Paragraph("<b>Cruise Summary:</b> " + cruise_description, self.body_text)),
        # flowables.append(Paragraph("<b>Cruise Location:</b> " + cruise_location, self.body_text)),
        # flowables.append(Paragraph("<b>Cruise Ports:</b> " + cruise_departure_location + " --> " + cruise_arrival_location, self.body_text)),
        # flowables.append(Paragraph("<b>Cruise Dates:</b> " + datetime.fromisoformat(self.cruise_record['start_ts'][:-1]).strftime('%Y-%m-%d') + " --> " + datetime.fromisoformat(self.cruise_record['stop_ts'][:-1]).strftime('%Y-%m-%d'), self.body_text)),
        # flowables.append(Paragraph("Dive Summary:", self.coverHeader)),
        flowables.append(Paragraph("<b>Dive Number:</b> %s" % self.lowering_record['lowering_id'], self.body_text))
        flowables.append(Paragraph("<b>Dive Location:</b> %s" % self.lowering_record['lowering_location'] or '', self.body_text))
        if 'lowering_description' in self.lowering_record['lowering_additional_meta'] and self.lowering_record['lowering_additional_meta']['lowering_description'] != '':
            description = self.lowering_record['lowering_additional_meta']['lowering_description'].split('\n\n')
            flowables.append(Paragraph("<b>Dive Summary:</b> %s" % description[0], self.body_text))
            for paragraph in description[1:]:
                flowables.append(Paragraph(paragraph.replace('\n','<br/>'), self.body_text))
        flowables.append(Spacer(PAGE_WIDTH, 5 * mm))
        flowables.append(summary_table)
        # flowables.append(stat_table)
        # flowables.append(NextPageTemplate('TOC'))
        # flowables.append(PageBreak())
        # flowables.append(toc)
        flowables.append(NextPageTemplate('Normal'))
        flowables.append(PageBreak())

        # flowables.append(Paragraph("Dive Information:", self.heading_1))
        # flowables.append(summary_table)

        if dive_track_filename:
            flowables.append(Paragraph("Dive Track:", self.heading_1))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
            flowables.append(dive_track)
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        if depth_plot_filename:
            flowables.append(Paragraph("Depth Profile:", self.heading_1))
            flowables.append(depth_plot)

        if dive_track_filename or depth_plot_filename:
            flowables.append(PageBreak())

        flowables.append(Paragraph("Data Plots:", self.heading_1))

        if depths_plot_filename:
            flowables.append(Paragraph("Depth Profiles From All Depth Sensors:", self.heading_2))
            flowables.append(depths_plot)

        if comp_datafile: 
            flowables.append(PageBreak())
            flowables.append(Paragraph("Compensator Pressures:", self.heading_2))

            if comp_data_plot_filename:
                flowables.append(comp_data_plot)
                flowables.append(Spacer(PAGE_WIDTH, 0.5 * cm))

            if comp_data_dive_summary_table:
                flowables.append(comp_data_dive_summary_table)
                flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

            if comp_data_on_bottom_table:
                flowables.append(comp_data_on_bottom_table)

        if downcast_ctd_data_filename or upcast_ctd_data_filename:
            flowables.append(PageBreak())
            flowables.append(Paragraph("CTD Profiles:", self.heading_2))

            if downcast_ctd_data_filename:
                flowables.append(downcast_ctd_data)

            if upcast_ctd_data_filename:
                flowables.append(upcast_ctd_data)

        if downcast_o2_data_filename or upcast_o2_data_filename:
            flowables.append(PageBreak())
            flowables.append(Paragraph("O2 Profiles:", self.heading_2))

            if downcast_o2_data_filename:
                flowables.append(downcast_o2_data)

            if upcast_o2_data_filename:
                flowables.append(upcast_o2_data)

        # flowables.append(PageBreak())

        if len(problem_tables) == 0:
            flowables.append(Paragraph("Problems:", self.heading_1))
            flowables.append(Paragraph("No PROBLEM events recorded for this dive", self.body_text))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        else:
            flowables.append(PageBreak())
            flowables.append(Paragraph("Problems:", self.heading_1))
            for table, _ in enumerate(problem_tables):
                flowables.append(problem_tables[table])
                flowables.append(Spacer(PAGE_WIDTH, 0.5 * cm))

        flowables.append(Paragraph("Watch Changes:", self.heading_1))
        if watch_change_table:
            flowables.append(Paragraph("Summary:", self.heading_2))
            flowables.append(watch_change_summary_table)
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
            flowables.append(watch_change_plot)
            flowables.append(PageBreak())

            flowables.append(Paragraph("Event - WATCH CHANGE:", self.heading_2))
            flowables.append(watch_change_table)
            flowables.append(PageBreak())

        else:
            flowables.append(Paragraph("No WATCH CHANGE events recorded for this dive", self.body_text))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        logging.info('Building report')

        doc.multiBuild(
            flowables
        )
        pdf_data = report_buffer.getvalue()
        report_buffer.close()
        return pdf_data


# -------------------------------------------------------------------------------------
# Required python code for running the script as a stand-alone utility
# -------------------------------------------------------------------------------------
if __name__ == '__main__':

    import argparse
    import os

    parser = argparse.ArgumentParser(description='Build ' + VEHICLE_NAME + ' Dive Summary Report')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-o','--output_dir', help='output directory to save report')
    parser.add_argument('lowering_id', help='lowering_id to build report for (i.e. CHR0085).')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    # verify lowering exists
    lowering_uid = get_lowering_uid_by_id(parsed_args.lowering_id)

    if lowering_uid is None:
        logging.error("No lowering found for lowering_id: %s", parsed_args.lowering_id)
        sys.exit(0)

    try:
        vehicle_report = LoweringVehicleReport(lowering_uid)
        OUTPUT_PATH = parsed_args.output_dir if parsed_args.output_dir else os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering_uid)
        REPORT_FILENAME = VEHICLE_NAME + '_' + parsed_args.lowering_id + '_Dive_Vehicle_Report.pdf'

        try:
            with open(os.path.join(OUTPUT_PATH, REPORT_FILENAME), 'wb') as file:
                file.write(vehicle_report.export_pdf())

        except Exception as err:
            logging.error("Unable to build report: %s", os.path.join(OUTPUT_PATH, REPORT_FILENAME))
            logging.debug(str(err))
            raise err

    except KeyboardInterrupt:
        logging.warning('Interrupted')
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0) # pylint: disable=protected-access


    # LOWERING_PATH = os.path.join(API_SERVER_FILE_PATH, 'lowerings')
    # OUTPUT_PATH = os.path.join(LOWERING_PATH, lowering_uid)

    # cruise = get_cruise_by_lowering(lowering_uid)
    # if not cruise:
    #     logging.error("No cruise found for lowering_id: " + args.lowering_id)
    #     try:
    #         sys.exit(0)
    #     except SystemExit:
    #         os._exit(0)


    # OUTPUT_FILENAME = cruise['cruise_id'] + '_Dive_' + args.lowering_id + '_Dive_Vehicle_Report.pdf'

    # PDF = LoweringVehicleReport(lowering_uid)

    # try:
    #     f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
    #     f.write(PDF.build_pdf())
    #     f.close()
   
    # except Exception as error:
    #     logging.error("Unable to build report")
    #     logging.error(str(error))





