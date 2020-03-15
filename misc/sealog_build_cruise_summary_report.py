import logging
from io import BytesIO
from string import Formatter
from reportlab.platypus import Paragraph, Table, Spacer, NextPageTemplate
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from datetime import datetime, timedelta
from reporting.sealog_rl_doc_template import RLDocTemplate 

from reporting.sealog_SOI_report_builder import SOICruiseReportCreator
from python_sealog.cruises import getCruiseUIDByID
from python_sealog.settings import apiServerFilePath

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

tmpDir = None

# def _seconds_to_hours_formatter(x, pos):
#     """
#     Convert x from seconds to hh:mm
#     """
#     return '%d:00' % (x//3600)

def _strfdelta(tdelta, fmt='{D:02}d {H:02}h {M:02}m {S:02}s', inputtype='timedelta'):
    """
    Convert a datetime.timedelta object or a regular number to a custom-
    formatted string, just like the stftime() method does for datetime.datetime
    objects.

    The fmt argument allows custom formatting to be specified.  Fields can
    include seconds, minutes, hours, days, and weeks.  Each field is optional.

    Some examples:
        '{D:02}d {H:02}h {M:02}m {S:02}s' --> '05d 08h 04m 02s' (default)
        '{W}w {D}d {H}:{M:02}:{S:02}'     --> '4w 5d 8:04:02'
        '{D:2}d {H:2}:{M:02}:{S:02}'      --> ' 5d  8:04:02'
        '{H}h {S}s'                       --> '72h 800s'

    The inputtype argument allows tdelta to be a regular number instead of the 
    default, which is a datetime.timedelta object.  Valid inputtype strings:
        's', 'seconds',
        'm', 'minutes',
        'h', 'hours',
        'd', 'days',
        'w', 'weeks'
    """
    if not tdelta:
        return ''

    # Convert tdelta to integer seconds.
    if inputtype == 'timedelta':
        remainder = int(tdelta.total_seconds())
    elif inputtype in ['s', 'seconds']:
        remainder = int(tdelta)
    elif inputtype in ['m', 'minutes']:
        remainder = int(tdelta)*60
    elif inputtype in ['h', 'hours']:
        remainder = int(tdelta)*3600
    elif inputtype in ['d', 'days']:
        remainder = int(tdelta)*86400
    elif inputtype in ['w', 'weeks']:
        remainder = int(tdelta)*604800
    else:
        return None

    f = Formatter()
    desired_fields = [field_tuple[1] for field_tuple in f.parse(fmt)]
    possible_fields = ('W', 'D', 'H', 'M', 'S')
    constants = {'W': 604800, 'D': 86400, 'H': 3600, 'M': 60, 'S': 1}
    values = {}
    for field in possible_fields:
        if field in desired_fields and field in constants:
            values[field], remainder = divmod(remainder, constants[field])
    return f.format(fmt, **values)


class CruiseSummaryReport(SOICruiseReportCreator):

    def __init__(self, cruise_uid):
        super(CruiseSummaryReport, self).__init__(cruise_uid)


    def build_pdf(self):
        pdf_buffer = BytesIO()
        my_doc = RLDocTemplate(
            pdf_buffer,
            pagesize=defaultPageSize,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Cruise Summary Report: " + self.cruise_record['cruise_id'],
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

        stat_table = self._build_stat_table()

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
        flowables.append(Paragraph("Dive Stats:", self.coverHeader)),
        flowables.append(Spacer(PAGE_WIDTH, 3 * mm)),
        flowables.append(stat_table),

        # flowables = [
        #     Paragraph("Cruise Summary:", self.coverHeader),
        #     Paragraph("<b>Cruise ID:</b> " + self.cruise_record['cruise_id'], self.bodyText),
        #     Paragraph("<b>Cruise PI:</b> " + cruise_location, self.bodyText),
        #     Paragraph("<b>Cruise Summary:</b> " + cruise_description, self.bodyText),
        #     Paragraph("<b>Cruise Location:</b> " + cruise_location, self.bodyText),
        #     Paragraph("<b>Cruise Ports:</b> " + cruise_departure_location + " --> " + cruise_arrival_location, self.bodyText),
        #     Paragraph("<b>Cruise Dates:</b> " + datetime.fromisoformat(self.cruise_record['start_ts'][:-1]).strftime('%Y-%m-%d') + " --> " + datetime.fromisoformat(self.cruise_record['stop_ts'][:-1]).strftime('%Y-%m-%d'), self.bodyText),
        #     Paragraph("<b>Dive Stats:</b>", self.bodyText),
        #     Spacer(PAGE_WIDTH, 3 * mm),
        #     stat_table
        # ]

        logger.debug('Building report')

        my_doc.multiBuild(
            flowables
        )
        pdf_value = pdf_buffer.getvalue()
        pdf_buffer.close()
        return pdf_value


if __name__ == '__main__':
    """
    build the cruise summary report
    """

    import argparse
    import os
    import sys
    import shutil

    parser = argparse.ArgumentParser(description='Build Dive Summary Report')
    parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
    parser.add_argument('cruise_id', help='lowering_id to build report for (i.e. FK200126).')

    args = parser.parse_args()

    # Turn on debug mode
    if args.debug:
        logger.info("Setting log level to DEBUG")
        logger.setLevel(logging.DEBUG)
        for handler in logger.handlers:
            handler.setLevel(logging.DEBUG)
        logger.debug("Log level now set to DEBUG")

    # verify lowering exists
    cruise_uid = getCruiseUIDByID(args.cruise_id)

    if cruise_uid == None:
        logger.error("No cruise found for cruise_id: " + args.cruise_id)
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)

    CRUISE_PATH = os.path.join(apiServerFilePath, 'cruises')
    OUTPUT_PATH = os.path.join(CRUISE_PATH, cruise_uid)
    OUTPUT_FILENAME = args.cruise_id + '_Cruise_Summary_Report.pdf'

    PDF = CruiseSummaryReport(cruise_uid)

    try:
        f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
        f.write(PDF.build_pdf())
        f.close()
   
    except Exception as error:
        logger.error("Unable to build report")
        logger.error(str(error))
