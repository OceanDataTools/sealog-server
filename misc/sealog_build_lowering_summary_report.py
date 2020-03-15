import logging
from io import BytesIO
from reportlab.platypus import NextPageTemplate, Paragraph, PageBreak, Spacer, Table, Image
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from datetime import datetime, timedelta
from reporting.sealog_rl_doc_template import RLDocTemplate 
from reporting.sealog_SOI_report_builder import SOILoweringReportCreator

from python_sealog.settings import apiServerFilePath
from python_sealog.lowerings import getLoweringUIDByID
from python_sealog.cruises import getCruiseByLowering

defaultPageSize = A4
PAGE_WIDTH, PAGE_HEIGHT= defaultPageSize
BASE_MARGIN = 1 * cm

# default log level
LOG_LEVEL = logging.INFO

# create logger
logging.basicConfig(level=LOG_LEVEL,
                    # format='%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s'
                    format='%(levelname)s - %(message)s'
                   )

logger = logging.getLogger(__file__)

class LoweringSummaryReport(SOILoweringReportCreator):

    def __init__(self, lowering_uid):
        super(LoweringSummaryReport, self).__init__(lowering_uid)

    def build_pdf(self):

        logger.debug("build_pdf")
        pdf_buffer = BytesIO()
        my_doc = RLDocTemplate(
            pdf_buffer,
            pagesize=defaultPageSize,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Dive Summary Report: " + self.cruise_record['cruise_id'] + '_' + self.lowering_record['lowering_id'],
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
        sample_table = self._build_sample_table()
        free_form_table = self._build_free_form_table()
        watch_change_table = self._build_watch_change_table()
        watch_change_summary_table = self._build_watch_change_summary_table()
        problem_tables = self._build_problem_tables()
        event_breakdown_table = self._build_event_breakdown_table()
        event_value_tables_tables, event_value_tables_event_values = self._build_non_system_events_tables()

        depth_plot_filename = self._build_depth_plot()
        if depth_plot_filename:
            depth_plot = Image(depth_plot_filename)
            depth_plot._restrictSize(PAGE_WIDTH -5 * cm, 10 * cm)
            depth_plot.hAlign = 'CENTER'

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

        # if downcast_sv_data_filename or upcast_sv_data_filename:
        
        #     flowables.append(Paragraph("SV Profiles:", self.heading2))
        
        #     if downcast_sv_data_filename:
        #         flowables.append(downcast_sv_data)
        #         # flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        #     if downcast_sv_data_filename:
        #         flowables.append(upcast_sv_data)
        
        #     flowables.append(PageBreak())

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

        flowables.append(Paragraph("Events:", self.heading1))
        flowables.append(Paragraph("Event Breakdown Table:", self.heading2))
        flowables.append(event_breakdown_table)
        flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        if len(event_value_tables_tables) == 0:
            flowables.append(Paragraph("No template-based events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))

        else:
            # print(event_value_tables_event_values)
            for event_value_tables_table in range(len(event_value_tables_tables)):
                if event_value_tables_tables[event_value_tables_table]:
                    flowables.append(Paragraph("Event - " + event_value_tables_event_values[event_value_tables_table], self.heading2))
                    flowables.append(event_value_tables_tables[event_value_tables_table])

        flowables.append(Paragraph("Event - FREE_FORM:", self.heading2))
        if not free_form_table:
            flowables.append(Paragraph("No FREE_FORM events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
        else:
            flowables.append(free_form_table)

        flowables.append(Paragraph("Event - SAMPLE:", self.heading2))
        if not sample_table:
            flowables.append(Paragraph("No SAMPLE events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 1 * cm))
        else:
            flowables.append(sample_table)

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
    import os
    import sys
    import shutil

    parser = argparse.ArgumentParser(description='Build Dive Summary Report')
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


    OUTPUT_FILENAME = cruise['cruise_id'] + '_Dive_' + args.lowering_id + '_Dive_Summary_Report.pdf'

    PDF = LoweringSummaryReport(lowering_uid)

    try:
        f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
        f.write(PDF.build_pdf())
        f.close()
   
    except Exception as error:
        logger.error("Unable to build report")
        logger.error(str(error))





