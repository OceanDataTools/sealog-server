import logging
from io import BytesIO
from reportlab.platypus import NextPageTemplate, Paragraph, PageBreak, Spacer
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from datetime import datetime, timedelta
from reporting.sealog_rl_doc_template import RLDocTemplate 
from reporting.sealog_SOI_report_builder import SOILoweringReportCreator

from python_sealog.settings import apiServerFilePath, headers
from python_sealog.lowerings import getLoweringUIDByID
from python_sealog.cruises import getCruiseByLowering

defaultPageSize = A4
PAGE_WIDTH, PAGE_HEIGHT= defaultPageSize
BASE_MARGIN = 5 * mm

# default log level
LOG_LEVEL = logging.INFO

# create logger
logging.basicConfig(level=LOG_LEVEL,
                    # format='%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s'
                    format='%(levelname)s - %(message)s'
                   )

logger = logging.getLogger(__file__)

class LoweringSampleReport(SOILoweringReportCreator):

    def __init__(self, lowering_uid):
        super(LoweringSampleReport, self).__init__(lowering_uid)

    def build_pdf(self):
        pdf_buffer = BytesIO()
        my_doc = RLDocTemplate(
            pdf_buffer,
            pagesize=defaultPageSize,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Dive Sample Report: " + self.cruise_record['cruise_id'] + '_' + self.lowering_record['lowering_id'],
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
        sample_tables = self._build_sample_tables_with_previews()
        sample_table = self._build_sample_table()

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
        flowables.append(PageBreak()),

        flowables.append(Paragraph("Samples:", self.heading1))
        if len(sample_tables) == 0:
            flowables.append(Paragraph("No SAMPLE events recorded for this dive", self.bodyText))

        else:
            flowables.append(sample_table)
            flowables.append(PageBreak())

            for table in range(len(sample_tables)):
                flowables.append(sample_tables[table])
                flowables.append(Spacer(PAGE_WIDTH, 3 * mm))

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

    parser = argparse.ArgumentParser(description='Build Dive Sample Report')
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


    OUTPUT_FILENAME = cruise['cruise_id'] + '_Dive_' + args.lowering_id + '_Dive_Sample_Report.pdf'

    PDF = LoweringSampleReport(lowering_uid)

    try:
        f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
        f.write(PDF.build_pdf())
        f.close()
   
    except Exception as error:
        logger.error("Unable to build report")
        logger.error(str(error))
