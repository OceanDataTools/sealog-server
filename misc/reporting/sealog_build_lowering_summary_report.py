#!/usr/bin/env python3
'''
FILE:           sealog_build_lowering_summary_report.py

DESCRIPTION:    Build the lowering summary report.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-05-03
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import sys
import math
import logging
from io import BytesIO
from datetime import datetime

from reportlab.platypus import NextPageTemplate, Paragraph, PageBreak, Spacer, Image
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm

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

class LoweringSummaryReport(LoweringReportCreator): # pylint: disable=too-few-public-methods
    '''
    Build lowering summary report
    '''

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
            title="Dive Summary Report: " + self.lowering_record['lowering_id'],
            subtitle="Remotely Operated Vehicle: " + VEHICLE_NAME,
            author=AUTHOR
        )

        stat_table = self._build_stat_table()
        summary_table = self._build_summary_table()
        # sample_table = self._build_sample_table()
        free_form_table = self._build_free_form_table()
        # problem_tables = self._build_problem_tables()
        event_breakdown_table = self._build_event_breakdown_table()
        event_table_tables, event_table_event_values = self._build_non_system_events_tables()
        # system_event_table_tables, system_event_table_event_values = self._build_system_events_tables()

        depths_plot_filename = self._build_depths_plot()
        if depths_plot_filename:
            depths_plot = Image(depths_plot_filename)
            depths_plot._restrictSize(PAGE_WIDTH - 5 * cm, PAGE_HEIGHT - 5 * cm)
            depths_plot.hAlign = 'CENTER'

        # downcast_sv_data_filename = self._build_downcast_sv_data()
        # if downcast_sv_data_filename:
        #     downcast_sv_data = Image(downcast_sv_data_filename)
        #     downcast_sv_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
        #     downcast_sv_data.hAlign = 'CENTER'

        # upcast_sv_data_filename = self._build_upcast_sv_data()
        # if upcast_sv_data_filename:
        #     upcast_sv_data = Image(upcast_sv_data_filename)
        #     upcast_sv_data._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
        #     upcast_sv_data.hAlign = 'CENTER'

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

        # watch_change_filename = self._build_watch_change_chart()
        # if watch_change_filename:
        #     watch_change_plot = Image(watch_change_filename)
        #     watch_change_plot._restrictSize(PAGE_WIDTH - 5 * cm, 10 * cm)
        #     watch_change_plot.hAlign = 'CENTER'

        # watch_change_table = self._build_watch_change_table()
        # watch_change_summary_table = self._build_watch_change_summary_table()

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
        # flowables.append(Paragraph("Cruise Summary:", self.cover_header))
        # flowables.append(Paragraph("<b>Cruise ID:</b> %s" % self.cruise_record['cruise_id'], self.body_text))
        # flowables.append(Paragraph("<b>Cruise PI:</b> %s" % self.cruise_record['cruise_additional_meta']['cruise_pi'] or '', self.body_text))
        # flowables.append(Paragraph("<b>Cruise Description:</b> %s" % self.cruise_record['cruise_additional_meta']['cruise_description'] or '', self.body_text))
        # flowables.append(Paragraph("<b>Cruise Location:</b> %s" % self.cruise_record['cruise_location'] or '', self.body_text))
        # flowables.append(Paragraph("<b>Cruise Ports:</b> %s" % self.cruise_record['cruise_additional_meta']['cruise_departure_location'] or '' + " --> " + self.cruise_record['cruise_additional_meta']['cruise_arrival_location'] or '', self.body_text))
        # flowables.append(Paragraph("<b>Cruise Dates:</b> %s --> %s" % (datetime.fromisoformat(self.cruise_record['start_ts'][:-1]).strftime('%Y-%m-%d'), datetime.fromisoformat(self.cruise_record['stop_ts'][:-1]).strftime('%Y-%m-%d')), self.body_text))
        # flowables.append(Paragraph("Dive Summary:", self.cover_header))
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

        flowables.append(PageBreak())

        if downcast_ctd_data_filename or upcast_ctd_data_filename:
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

        #flowables.append(PageBreak())

        # if len(problem_tables) == 0:
        #     flowables.append(Paragraph("Problems:", self.heading_1))
        #     flowables.append(Paragraph("No PROBLEM events recorded for this dive", self.body_text))
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        # else:
        #     flowables.append(PageBreak())
        #     flowables.append(Paragraph("Problems:", self.heading_1))
        #     for table, _ in enumerate(problem_tables):
        #         flowables.append(problem_tables[table])
        #         flowables.append(Spacer(PAGE_WIDTH, 0.5 * cm))

        # flowables.append(Paragraph("Watch Changes:", self.heading_1))
        # if not watch_change_summary_table:
        #     flowables.append(Paragraph("No WATCH CHANGE events recorded for this dive", self.body_text))
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        # else:
        #     flowables.append(Paragraph("Summary:", self.heading_2))
        #     flowables.append(watch_change_summary_table)
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
        #     flowables.append(watch_change_plot)
        #     flowables.append(PageBreak())

        #     flowables.append(Paragraph("Event - WATCH CHANGE:", self.heading_2))
        #     flowables.append(watch_change_table)
        #     flowables.append(PageBreak())

        flowables.append(Paragraph("Events:", self.heading_1))

        flowables.append(Paragraph("Event Breakdown Table:", self.heading_2))
        flowables.append(event_breakdown_table)

        if len(event_table_tables) == 0 and len(event_table_tables) == 0:
            flowables.append(Paragraph("No template-based events recorded for this dive", self.body_text))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        else:
            for table, _ in enumerate(event_table_tables):
                if event_table_tables[table]:
                    flowables.append(Paragraph("Event - " + event_table_event_values[table], self.heading_2))
                    flowables.append(event_table_tables[table])

        # if len(system_event_table_tables) == 0 and len(system_event_table_tables) == 0:
        #     flowables.append(Paragraph("No template-based events recorded for this dive", self.body_text))
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        # else:
        #     for table, _ in enumerate(system_event_table_tables):
        #         if system_event_table_tables[table]:
        #             flowables.append(Paragraph("Event - " + system_event_table_event_values[table], self.heading_2))
        #             flowables.append(system_event_table_tables[table])

        if free_form_table:
            flowables.append(Paragraph("Event - FREE_FORM:", self.heading_2))
            flowables.append(free_form_table)
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        # if highlights_table:
        #     flowables.append(Paragraph("Event - HIGHLIGHTS:", self.heading_2))
        #     flowables.append(highlights_table)
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        # if sample_table:
        #     flowables.append(Paragraph("Event - SAMPLE:", self.heading_2))
        #     flowables.append(sample_table)
        #     flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

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
        summary_report = LoweringSummaryReport(lowering_uid)
        OUTPUT_PATH = parsed_args.output_dir if parsed_args.output_dir else os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering_uid)
        REPORT_FILENAME = VEHICLE_NAME + '_' + parsed_args.lowering_id + '_Dive_Summary_Report.pdf'

        try:
            with open(os.path.join(OUTPUT_PATH, REPORT_FILENAME), 'wb') as file:
                file.write(summary_report.export_pdf())

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
