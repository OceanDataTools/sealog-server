import logging
import json
import time
import math
import glob
import os
import tempfile
from io import BytesIO
from string import Formatter
from reportlab.platypus import NextPageTemplate, Paragraph, PageBreak, Table, Spacer, Image
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from datetime import datetime, timedelta
from PIL import Image as pil_Image

import plotly.graph_objects as go
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as ticker
from reporting.sealog_rl_doc_template import RLDocTemplate 
from reporting.sealog_SOI_report_builder import SOILoweringReportCreator
from mpl_toolkits.basemap import Basemap

import numpy as np
import pandas as pd
from svglib.svglib import svg2rlg
import csv

from python_sealog.settings import apiServerURL, apiServerFilePath, cruisesAPIPath, eventsAPIPath, customVarAPIPath, headers
from python_sealog.lowerings import getLowering, getLoweringUIDByID
from python_sealog.cruises import getCruiseByLowering
from python_sealog.event_exports import getEventExportsByLowering
from python_sealog.event_templates import getEventTemplates

pd.set_option('mode.chained_assignment', None)

defaultPageSize = A4

PAGE_WIDTH, PAGE_HEIGHT= defaultPageSize
BASE_MARGIN = 5 * mm

CRUISE_DATA_ROOT = '/var/www/html/Completed'

# default log level
LOG_LEVEL = logging.INFO

# create logger
logging.basicConfig(level=LOG_LEVEL,
                    # format='%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s'
                    format='%(levelname)s - %(message)s'
                   )

logger = logging.getLogger(__file__)

class LoweringVehicleReport(SOILoweringReportCreator):

    def __init__(self, lowering_uid):
        super(LoweringVehicleReport, self).__init__(lowering_uid)


    def _build_vehicle_comp_datafile(self):

        logger.debug("Pulling vehicle comp data from Data Warehouse")

        path = os.path.join(CRUISE_DATA_ROOT, self.cruise_record['cruise_id'], 'Subastian', self.cruise_record['cruise_id'] + '_' + self.lowering_record['lowering_id'], 'SCSData', 'SUBASTIAN')
        prefix = 'UDP-SB-Mech-Comps-RAW_'
        extension = 'Raw'
        all_filenames = [i for i in glob.glob('{}/{}*.{}'.format(path, prefix, extension))]
        all_filenames.sort()
        # logger.debug(path + '/' + prefix + '*.' + extension)
        # logger.debug("Files: " + ", ".join(all_filenames))

        fd, comp_data_file = tempfile.mkstemp(suffix=".csv", dir=self.tmpDir)

        with(open(comp_data_file, 'w+')) as comb_fp:
            comb_fp.write("date,time,hdr,comp1,comp2,comp3,comp4,comp5,comp6\n")

            for f in all_filenames:
                with(open(f, 'r')) as fp:
                    comb_fp.write(fp.read())
        
        return comp_data_file


    def _import_comp_data(self, comp_file):

        logger.debug("Importing data into numpy array")

        comp_data = pd.read_csv(comp_file)
        comp_data['date_time'] = pd.to_datetime(comp_data['date'] + ' ' + comp_data['time'], infer_datetime_format=True)

        mask = (comp_data['date_time'] >= np.datetime64(self.lowering_milestones['off_deck_dt'])) & (comp_data['date_time'] <= np.datetime64(self.lowering_milestones['stop_dt']))
        comp_data = comp_data.loc[mask]

        return list(comp_data.columns), comp_data.to_numpy()


    def _build_comp_data_dive_summary(self, comp_data_headers, comp_data):

        if comp_data is None or len(comp_data) == 0:
            logger.warning("No comp data captured, can't build comp data dive summary table.")
            return None

        logger.debug('Building comp data dive summary table')

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
                'Comp 1',
                round(comp_data[0][comp_data_headers.index('comp1')],4),
                round(comp_data[-1][comp_data_headers.index('comp1')],4),
                round(comp_data[-1][comp_data_headers.index('comp1')] - comp_data[0][comp_data_headers.index('comp1')],4)
            ],
            [
                'Comp 2',
                round(comp_data[0][comp_data_headers.index('comp2')],4),
                round(comp_data[-1][comp_data_headers.index('comp2')],4),
                round(comp_data[-1][comp_data_headers.index('comp2')] - comp_data[0][comp_data_headers.index('comp2')],4)
            ],
            [
                'Comp 3',
                round(comp_data[0][comp_data_headers.index('comp3')],4),
                round(comp_data[-1][comp_data_headers.index('comp3')],4),
                round(comp_data[-1][comp_data_headers.index('comp3')] - comp_data[0][comp_data_headers.index('comp3')],4)
            ],
            [
                'Comp 4',
                round(comp_data[0][comp_data_headers.index('comp4')],4),
                round(comp_data[-1][comp_data_headers.index('comp4')],4),
                round(comp_data[-1][comp_data_headers.index('comp4')] - comp_data[0][comp_data_headers.index('comp4')],4)
            ],
            [
                'Comp 5',
                round(comp_data[0][comp_data_headers.index('comp5')],4),
                round(comp_data[-1][comp_data_headers.index('comp5')],4),
                round(comp_data[-1][comp_data_headers.index('comp5')] - comp_data[0][comp_data_headers.index('comp5')],4)
            ],
            [
                'Comp 6',
                round(comp_data[0][comp_data_headers.index('comp6')],4),
                round(comp_data[-1][comp_data_headers.index('comp6')],4),
                round(comp_data[-1][comp_data_headers.index('comp6')] - comp_data[0][comp_data_headers.index('comp6')],4)
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
            logger.warning("No comp data captured, can't build comp on bottom table.")
            return None

        if not self.lowering_milestones['on_bottom_dt'] or not self.lowering_milestones['off_bottom_dt']:
            logger.warning("No On/Off Bottom milestones captured, can't build on bottom compensator stats.")
            return None
        
        mask = (comp_data[:,comp_data_headers.index('date_time')] >= np.datetime64(self.lowering_milestones['on_bottom_dt'])) & (comp_data[:,comp_data_headers.index('date_time')] < np.datetime64(self.lowering_milestones['off_bottom_dt']))
        comp_data = comp_data[mask]

        logger.debug('Building comp data on bottom table')

        comp_data_on_bottom_data = [
            [
                'Compensators (On Bottom/@ Target Depth)',
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
                'Comp 1',
                round(comp_data[0][comp_data_headers.index('comp1')],4),
                round(comp_data[-1][comp_data_headers.index('comp1')],4),
                round(comp_data[-1][comp_data_headers.index('comp1')] - comp_data[0][comp_data_headers.index('comp1')],4)
            ],
            [
                'Comp 2',
                round(comp_data[0][comp_data_headers.index('comp2')],4),
                round(comp_data[-1][comp_data_headers.index('comp2')],4),
                round(comp_data[-1][comp_data_headers.index('comp2')] - comp_data[0][comp_data_headers.index('comp2')],4)
            ],
            [
                'Comp 3',
                round(comp_data[0][comp_data_headers.index('comp3')],4),
                round(comp_data[-1][comp_data_headers.index('comp3')],4),
                round(comp_data[-1][comp_data_headers.index('comp3')] - comp_data[0][comp_data_headers.index('comp3')],4)
            ],
            [
                'Comp 4',
                round(comp_data[0][comp_data_headers.index('comp4')],4),
                round(comp_data[-1][comp_data_headers.index('comp4')],4),
                round(comp_data[-1][comp_data_headers.index('comp4')] - comp_data[0][comp_data_headers.index('comp4')],4)
            ],
            [
                'Comp 5',
                round(comp_data[0][comp_data_headers.index('comp5')],4),
                round(comp_data[-1][comp_data_headers.index('comp5')],4),
                round(comp_data[-1][comp_data_headers.index('comp5')] - comp_data[0][comp_data_headers.index('comp5')],4)
            ],
            [
                'Comp 6',
                round(comp_data[0][comp_data_headers.index('comp6')],4),
                round(comp_data[-1][comp_data_headers.index('comp6')],4),
                round(comp_data[-1][comp_data_headers.index('comp6')] - comp_data[0][comp_data_headers.index('comp6')],4)
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
            logger.warning("No comp data captured, can't build comp data plot.")
            return None

        logger.debug('Building comp data plot')

        start_ts = next((ts[0] for ts in comp_data[:,[comp_data_headers.index( 'date_time' )]].astype(datetime) if ts is not None), None)

        fig_comp, ax_comp_1 = plt.subplots(figsize=(8, 4.5))

        ax_comp_1.set_title(label='Compensator Pressure Data', pad=30)
        ax_comp_1.set(xlabel='Time', ylim=(0, 100))
        ax_comp_1.grid(linestyle='--') 

        ax_comp_1.xaxis.set_major_locator(mdates.HourLocator(interval=4))
        formatter = mdates.DateFormatter("%H:00")
        ax_comp_1.xaxis.set_major_formatter(formatter)

        x_ts = [ datetime.utcfromtimestamp((tsStr[0] - start_ts).total_seconds()) for tsStr in comp_data[:,[comp_data_headers.index( 'date_time' )]].astype(datetime)]

        comp_data_1 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp1' )]]]
        comp_data_2 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp2' )]]]
        comp_data_3 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp3' )]]]
        comp_data_4 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp4' )]]]
        comp_data_5 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp5' )]]]
        comp_data_6 = [ data[0] if data[0] else None for data in comp_data[:,[comp_data_headers.index( 'comp6' )]]]

        Comp_1, = ax_comp_1.plot(x_ts, comp_data_1, label='Comp 1', color='blue', linewidth=1)
        Comp_2, = ax_comp_1.plot(x_ts, comp_data_2, label='Comp 2', color='orange', linewidth=1)
        Comp_3, = ax_comp_1.plot(x_ts, comp_data_3, label='Comp 3', color='green', linewidth=1)
        Comp_4, = ax_comp_1.plot(x_ts, comp_data_4, label='Comp 4', color='red', linewidth=1)
        Comp_5, = ax_comp_1.plot(x_ts, comp_data_5, label='Comp 5', color='purple', linewidth=1)
        Comp_6, = ax_comp_1.plot(x_ts, comp_data_6, label='Comp 6', color='gray', linewidth=1)


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
            logger.warning("No CTD data captured, can't build add depth and temp profiles.")

        ax_comp_1.legend(handles=[Comp_1,Comp_2,Comp_3,Comp_4,Comp_5,Comp_6], loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=6, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_comp.tight_layout()
        fig_comp.savefig(imgdata, format='svg')
        plt.close(fig_comp)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def build_pdf(self):
        pdf_buffer = BytesIO()
        my_doc = RLDocTemplate(
            pdf_buffer,
            pagesize=defaultPageSize,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Dive Vehicle Report: " + self.cruise_record['cruise_id'] + '_' + self.lowering_record['lowering_id'],
            author="Schmidt Ocean Institute"
        )

        cruise_location = ''
        if self.cruise_record['cruise_location']:
            cruise_location = self.cruise_record['cruise_location']

        cruise_description = ''
        if self.cruise_record['cruise_additional_meta']['cruise_description']:
            cruise_description = self.cruise_record['cruise_additional_meta']['cruise_description']

        cruise_departure_location = ''
        if self.cruise_record['cruise_additional_meta']['cruise_departure_location']:
            cruise_departure_location = self.cruise_record['cruise_additional_meta']['cruise_departure_location']

        cruise_arrival_location = ''
        if self.cruise_record['cruise_additional_meta']['cruise_arrival_location']:
            cruise_arrival_location = self.cruise_record['cruise_additional_meta']['cruise_arrival_location']

        cruise_pi = ''
        if self.cruise_record['cruise_additional_meta']['cruise_pi']:
            cruise_pi = self.cruise_record['cruise_additional_meta']['cruise_pi']

        lowering_location = ''
        if self.lowering_record['lowering_location']:
            lowering_location = self.lowering_record['lowering_location']

        lowering_description = ''
        if self.lowering_record['lowering_additional_meta']['lowering_description']:
            lowering_description = self.lowering_record['lowering_additional_meta']['lowering_description']

        stat_table = self._build_stat_table()
        summary_table = self._build_summary_table()
        watch_change_table = self._build_watch_change_table()
        watch_change_summary_table = self._build_watch_change_summary_table()
        problem_tables = self._build_problem_tables()

        comp_datafile = self._build_vehicle_comp_datafile()
        comp_data_headers, comp_data = self._import_comp_data(comp_datafile)

        comp_data_dive_summary_table = self._build_comp_data_dive_summary(comp_data_headers, comp_data)
        comp_data_on_bottom_table = self._build_comp_data_on_bottom(comp_data_headers, comp_data)

        depth_plot_filename = self._build_depth_plot()
        if depth_plot_filename:
            depth_plot = Image(depth_plot_filename)
            depth_plot._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
            depth_plot.hAlign = 'CENTER'

        depths_plot_filename = self._build_depths_plot()
        if depths_plot_filename:
            depths_plot = Image(depths_plot_filename)
            depths_plot._restrictSize(PAGE_WIDTH - 5 * cm, PAGE_HEIGHT - 5 * cm)
            depths_plot.hAlign = 'CENTER'

        comp_data_plot_filename = self._build_comp_data_plot(comp_data_headers, comp_data)
        if comp_data_plot_filename:
            comp_data_plot = Image(comp_data_plot_filename)
            comp_data_plot._restrictSize(PAGE_WIDTH - 2.5 * cm, 15 * cm)
            comp_data_plot.hAlign = 'CENTER'

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

        dive_track_filename = self._build_dive_track()
        if dive_track_filename:
            dive_track = Image(dive_track_filename)
            dive_track._restrictSize(PAGE_WIDTH - 5 * cm, PAGE_HEIGHT - 5 * cm)
            dive_track.hAlign = 'CENTER'

        toc = TableOfContents()
        toc.levelStyles = [ self.tocHeading1, self.tocHeading2 ]

        logger.debug("Building flowables array")

        flowables = []

        flowables.append(NextPageTemplate('Normal'))
        flowables.append(Paragraph("Cruise Summary:", self.coverHeader)),
        flowables.append(Paragraph("<b>Cruise ID:</b> " + self.cruise_record['cruise_id'], self.bodyText)),
        flowables.append(Paragraph("<b>Cruise PI:</b> " + cruise_location, self.bodyText)),
        flowables.append(Paragraph("<b>Cruise Summary:</b> " + cruise_description, self.bodyText)),
        flowables.append(Paragraph("<b>Cruise Location:</b> " + cruise_location, self.bodyText)),
        flowables.append(Paragraph("<b>Cruise Ports:</b> " + cruise_departure_location + " --> " + cruise_arrival_location, self.bodyText)),
        flowables.append(Paragraph("<b>Cruise Dates:</b> " + datetime.fromisoformat(self.cruise_record['start_ts'][:-1]).strftime('%Y-%m-%d') + " --> " + datetime.fromisoformat(self.cruise_record['stop_ts'][:-1]).strftime('%Y-%m-%d'), self.bodyText)),
        flowables.append(Paragraph("Dive Summary:", self.coverHeader)),
        flowables.append(Paragraph("<b>Dive Number:</b> " + self.lowering_record['lowering_id'], self.bodyText)),
        flowables.append(Paragraph("<b>Dive Summary:</b> " + lowering_description, self.bodyText)),
        flowables.append(Paragraph("<b>Dive Location:</b> " + lowering_location, self.bodyText)),
        flowables.append(Spacer(PAGE_WIDTH, 3 * mm)),
        flowables.append(stat_table),
        flowables.append(NextPageTemplate('TOC'))
        flowables.append(PageBreak())
        flowables.append(toc),
        flowables.append(NextPageTemplate('Normal'))
        flowables.append(PageBreak())

        # flowables = [
        #     Paragraph("Cruise Summary:", self.coverHeader),
        #     Paragraph("<b>Cruise ID:</b> " + self.cruise_record['cruise_id'], self.bodyText),
        #     Paragraph("<b>Cruise PI:</b> " + cruise_location, self.bodyText),
        #     Paragraph("<b>Cruise Summary:</b> " + cruise_description, self.bodyText),
        #     Paragraph("<b>Cruise Location:</b> " + cruise_location, self.bodyText),
        #     Paragraph("<b>Cruise Ports:</b> " + cruise_departure_location + " --> " + cruise_arrival_location, self.bodyText),
        #     Paragraph("<b>Cruise Dates:</b> " + datetime.fromisoformat(self.cruise_record['start_ts'][:-1]).strftime('%Y-%m-%d') + " --> " + datetime.fromisoformat(self.cruise_record['stop_ts'][:-1]).strftime('%Y-%m-%d'), self.bodyText),
        #     Paragraph("Dive Summary:", self.coverHeader),
        #     Paragraph("<b>Dive Number:</b> " + self.lowering_record['lowering_id'], self.bodyText),
        #     Paragraph("<b>Dive Summary:</b> " + lowering_description, self.bodyText),
        #     Paragraph("<b>Dive Location:</b> " + lowering_location, self.bodyText),
        #     Spacer(PAGE_WIDTH, 1 * cm),
        #     stat_table,
        #     NextPageTemplate("TOC"),
        #     PageBreak(),
        #     toc,
        #     NextPageTemplate("Normal"),
        #     PageBreak(),
        # ]

        flowables.append(Paragraph("Dive Information:", self.heading1))
        flowables.append(summary_table)

        if dive_track_filename:
            flowables.append(Paragraph("Dive Track:", self.heading2))
            flowables.append(dive_track)
            flowables.append(PageBreak())

        if depth_plot_filename:
            flowables.append(Paragraph("Depth Profile:", self.heading2))
            flowables.append(depth_plot)

        flowables.append(Paragraph("Data Plots:", self.heading1))

        if depths_plot_filename:
            flowables.append(Paragraph("Depth Profiles From All Depth Sensors:", self.heading2))
            flowables.append(depths_plot)
            flowables.append(PageBreak())

        if comp_data_plot_filename:
            flowables.append(Paragraph("Compensator Pressures:", self.heading2))
            flowables.append(comp_data_plot)

        if comp_data_dive_summary_table:
            flowables.append(comp_data_dive_summary_table)
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        if comp_data_on_bottom_table:
            flowables.append(comp_data_on_bottom_table)

        flowables.append(PageBreak())

        if downcast_ctd_data_filename or upcast_ctd_data_filename:
        
            flowables.append(Paragraph("CTD Profiles:", self.heading2))
        
            if downcast_ctd_data_filename:
                flowables.append(downcast_ctd_data)

            if upcast_ctd_data_filename:
                flowables.append(upcast_ctd_data)

            flowables.append(PageBreak())

        if downcast_o2_data_filename or upcast_o2_data_filename:
            flowables.append(Paragraph("O2 Profiles:", self.heading2))
    
            if downcast_o2_data_filename:
                flowables.append(downcast_o2_data)
    
            if upcast_o2_data_filename:
                flowables.append(upcast_o2_data)

            flowables.append(PageBreak())

        flowables.append(Paragraph("Problems:", self.heading1))
        if len(problem_tables) == 0:
            flowables.append(Paragraph("No PROBLEM events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        else:
            for table in range(len(problem_tables)):
                flowables.append(problem_tables[table])
                flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
            flowables.append(PageBreak())

        flowables.append(Paragraph("Watch Changes:", self.heading1))
        if not watch_change_summary_table:
            flowables.append(Paragraph("No WATCH CHANGE events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        else:
            flowables.append(Paragraph("Summary:", self.heading2))
            flowables.append(watch_change_summary_table)
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
            flowables.append(watch_change_plot)
            flowables.append(PageBreak())

            flowables.append(Paragraph("Event - WATCH CHANGE:", self.heading2))
            flowables.append(watch_change_table)
            flowables.append(PageBreak())

        logger.debug('Building report')

        my_doc.multiBuild(
            flowables
        )
        pdf_value = pdf_buffer.getvalue()
        pdf_buffer.close()
        return pdf_value


if __name__ == '__main__':
    """
    This script submit a new ASNAP event at the specified interval
    """

    import argparse
    # import os # already declared
    import sys
    import shutil

    parser = argparse.ArgumentParser(description='Build Dive Vehicle Report')
    parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
    parser.add_argument('lowering_id', help='lowering_id to build report for (i.e. S0312).')

    args = parser.parse_args()

    # Turn on debug mode
    if args.debug:
        logger.info("Setting log level to DEBUG")
        logger.setLevel(logging.DEBUG)
        for handler in logger.handlers:
            handler.setLevel(logging.DEBUG)
        logger.debug("Log level now set to DEBUG")

    # verify lowering exists
    lowering_uid = getLoweringUIDByID(args.lowering_id)

    if lowering_uid == None:
        logger.error("No lowering found for lowering_id: " + args.lowering_id)
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)

    LOWERING_PATH = os.path.join(apiServerFilePath, 'lowerings')
    OUTPUT_PATH = os.path.join(LOWERING_PATH, lowering_uid)

    cruise = getCruiseByLowering(lowering_uid)
    if not cruise:
        logger.error("No cruise found for lowering_id: " + args.lowering_id)
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)


    OUTPUT_FILENAME = cruise['cruise_id'] + '_Dive_' + args.lowering_id + '_Dive_Vehicle_Report.pdf'

    PDF = LoweringVehicleReport(lowering_uid)

    try:
        f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
        f.write(PDF.build_pdf())
        f.close()
   
    except Exception as error:
        logger.error("Unable to build report")
        logger.error(str(error))





