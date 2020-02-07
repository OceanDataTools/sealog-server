import logging
import json
import time
from io import BytesIO
from string import Formatter
from reportlab.platypus import PageTemplate, BaseDocTemplate, NextPageTemplate, tableofcontents, Paragraph, PageBreak, Frame, Table, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.graphics import renderPDF
from reportlab.lib.pagesizes import letter
from reportlab.lib.sequencer import Sequencer
from reportlab.lib.units import cm, mm, inch
from reportlab.lib import colors
from datetime import datetime, timedelta
from PIL import Image as pil_Image

import plotly.graph_objects as go
import numpy as np
import pandas as pd
from svglib.svglib import svg2rlg
import csv
import tempfile

from python_sealog.settings import apiServerURL, apiServerFilePath, cruisesAPIPath, eventsAPIPath, customVarAPIPath, headers
from python_sealog.lowerings import getLowering, getLoweringUIDByID
from python_sealog.event_exports import getEventExportsByLowering

pd.set_option('mode.chained_assignment', None)

defaultPageSize = letter

PAGE_WIDTH, PAGE_HEIGHT= defaultPageSize
BASE_MARGIN = 5 * mm

# default log level
LOG_LEVEL = logging.INFO

# create logger
logging.basicConfig(level=LOG_LEVEL,
                    format='%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s'
                   )

logger = logging.getLogger(__file__)

tmpDir = None

def _strfdelta(tdelta, fmt='{D:02}d {H:02}h {M:02}m {S:02}s', inputtype='timedelta'):
    """Convert a datetime.timedelta object or a regular number to a custom-
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

def _scale(drawing, scaling_factor):
    """
    Scale a reportlab.graphics.shapes.Drawing()
    object while maintaining the aspect ratio
    """
    scaling_x = scaling_y = scaling_factor
   
    drawing.width = drawing.minWidth() * scaling_x
    drawing.height = drawing.height * scaling_y
    drawing.scale(scaling_x, scaling_y)
    return drawing

def _resize_image(input_image_path, output_image_path, size):
    original_image = pil_Image.open(input_image_path)
    width, height = original_image.size
    # print('The original image size is {wide} wide x {height} '
          # 'high'.format(wide=width, height=height))
    resized_image = original_image.resize(size)
    width, height = resized_image.size
    # print('The resized image size is {wide} wide x {height} '
    #       'high'.format(wide=width, height=height))
    # resized_image.show()
    resized_image.save(output_image_path)

class FrontCoverTemplate(PageTemplate):
    def __init__(self, id, pageSize=defaultPageSize, title='Title Goes Here', subtitle=None):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        self.title = title
        self.subtitle = subtitle

        frame1 = Frame(inch,
                       1.5*inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 318, id='cover')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
       
        canvas.saveState()
        canvas.setFont('Helvetica', 24)
        canvas.drawCentredString(doc.pagesize[0] / 2, doc.pagesize[1] - 2 * inch, self.title)

        if self.subtitle:
            canvas.setFont('Helvetica-Oblique', 20)
            canvas.drawCentredString(doc.pagesize[0] / 2, doc.pagesize[1] - 2.5 * inch, self.subtitle)
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(doc.pagesize[0] / 2, doc.pagesize[1] - 2.75 * inch, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
        else:
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(doc.pagesize[0] / 2, doc.pagesize[1] - 2.25 * inch, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))

        canvas.setFont('Helvetica', 10)
        canvas.line(inch, 120, self.pageWidth - inch, 120)

        canvas.drawImage('./assets/images/soi-logo.png', 1 * inch, 1 * inch, width=40 * 161/122, height=40, mask='auto')
        canvas.drawString(inch + 5 + 40 * 161/122, 100, 'Schmidt Ocean Institute')
        canvas.drawString(inch + 5 + 40 * 161/122, 88, '555 Bryant St. #374')
        canvas.drawString(inch + 5 + 40 * 161/122, 76, 'Palo Alto, CA 94301')
        canvas.drawImage('./assets/images/Subastian_Profile.png', PAGE_WIDTH - inch - 40 * 400/233, 1*inch, width=40 * 400/233, height=40, mask='auto')

        canvas.restoreState()


class OneColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=defaultPageSize):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(inch,
                       inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 2*inch,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, doc.chapter)
        canvas.line(inch, y, self.pageWidth - inch, y)
        canvas.drawCentredString(doc.pagesize[0] / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TOCTemplate(PageTemplate):
    def __init__(self, id, pageSize=defaultPageSize):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(inch,
                       inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 2*inch,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, 'Table of contents')
        canvas.line(inch, y, self.pageWidth - inch, y)
        canvas.drawCentredString(doc.pagesize[0] / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TwoColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=defaultPageSize):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        colWidth = 0.5 * (self.pageWidth - 2.25*inch)
        frame1 = Frame(inch,
                       inch,
                       colWidth,
                       self.pageHeight - 2*inch,
                       id='leftCol')
        frame2 = Frame(0.5 * self.pageWidth + 0.125,
                       inch,
                       colWidth,
                       self.pageHeight - 2*inch,
                       id='rightCol')
        PageTemplate.__init__(self, id, [frame1, frame2])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, doc.chapter)
        canvas.line(inch, y, self.pageWidth - inch, y*inch)
        canvas.drawCentredString(doc.pagesize[0] / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()


class RLDocTemplate(BaseDocTemplate):

    def __init__(self, *args, **kwargs):

        try:
            self.subtitle = kwargs.pop('subtitle')
        except KeyError:
            self.subtitle = None
            pass

        super().__init__(*args, **kwargs)

    def afterInit(self):
        self.addPageTemplates(FrontCoverTemplate('Cover', self.pagesize, title=self.title, subtitle=self.subtitle))
        self.addPageTemplates(TOCTemplate('TOC', self.pagesize))
        self.addPageTemplates(OneColumnTemplate('Normal', self.pagesize))
        self.addPageTemplates(TwoColumnTemplate('TwoColumn', self.pagesize))
        self.seq = Sequencer()

    def beforeDocument(self):
        self.canv.showOutline()
        self.title = self.title
        self.chapter = "(No chapter yet)"
        self.seq.reset('section')
        self.seq.reset('chapter')

    def afterFlowable(self, flowable):
        """Detect Level 1 and 2 headings, build outline,
        and track chapter title."""

        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            txt = flowable.getPlainText()

            if style == 'Title':
                self.title = txt
            elif style == 'Heading1':
                self.chapter = txt
                key = 'ch%s' % self.seq.nextf('chapter')
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(txt, key, 0, 0)
                self.seq.reset("section")
                self.notify('TOCEntry', (0, txt, self.page, key))
            elif style == 'Heading2':
                self.section = flowable.text
                key = 'ch%ss%s' % (self.seq.thisf("chapter"), self.seq.nextf("section"))
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(txt, key, 1, 0)
                self.notify('TOCEntry', (1, txt, self.page, key))

class PdfCreator:

    def __init__(self, lowering_uid, output_path):
        sample_style_sheet = getSampleStyleSheet()
        self.bodyText = sample_style_sheet['BodyText']
        self.heading1 = sample_style_sheet['Heading1']
        self.heading2 = sample_style_sheet['Heading2']
        self.output_path = output_path
        self.lowering_uid = lowering_uid
        self.lowering_record = getLowering(lowering_uid)

        self._import_data()
        self._build_stats()

        logger.debug(self.lowering_data_headers)

    def _import_data(self):

        logger.debug("Pulling data Sealog API")
        event_export_data = getEventExportsByLowering(self.lowering_uid, 'csv')
        # print(event_export_data)

        logger.debug("Importing data into numpy array")
        with tempfile.TemporaryFile(mode='w+') as fp:
           
            print(event_export_data, file=fp)
            fp.seek(0)

            reader = csv.reader(fp, delimiter=',')
            self.lowering_data_headers = next(reader)
            self.lowering_data = np.array(list(reader))

        # convert ts to datetime
        logger.debug("Converting ts from string to datetime")
        for row in range(len(self.lowering_data)):
            date = datetime.fromisoformat(self.lowering_data[row][self.lowering_data_headers.index( 'ts' )][:-1])
            self.lowering_data[[row],[self.lowering_data_headers.index( 'ts' )]] = np.datetime64(date)

        logger.debug("Done with conversion")

    def _build_stats(self):

        logger.debug('Building lowering stats data')

        self.lowering_milestones = dict(
            start_dt = None,
            on_bottom_dt = None,
            off_bottom_dt = None,
            stop_dt = None
        )

        self.lowering_stats = dict(
            max_depth = None,
            bounding_box = None,
            total_duration = None,
            descent_duration = None,
            ascent_duration = None,
            samples_collected = None
        )

        if self.lowering_record['start_ts']:
            try:
                self.lowering_milestones['start_dt'] = datetime.fromisoformat(self.lowering_record['start_ts'][:-1])
            except:
                pass

        if self.lowering_record['stop_ts']:
            try:
                self.lowering_milestones['stop_dt'] = datetime.fromisoformat(self.lowering_record['stop_ts'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_bottom']:
            try:
                self.lowering_milestones['on_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_bottom'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and self.lowering_record['lowering_additional_meta']['milestones']['lowering_off_bottom']:
            try:
                self.lowering_milestones['off_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_off_bottom'][:-1])
            except:
                pass

        if 'stats' in self.lowering_record['lowering_additional_meta'] and self.lowering_record['lowering_additional_meta']['stats']['max_depth']:
            try:
                self.lowering_stats['max_depth'] = float(self.lowering_record['lowering_additional_meta']['stats']['max_depth'])
            except:
                pass

        if 'stats' in self.lowering_record['lowering_additional_meta'] and self.lowering_record['lowering_additional_meta']['stats']['bounding_box']:
            try:
                self.lowering_stats['bounding_box'] = [float(elem) for elem in self.lowering_record['lowering_additional_meta']['stats']['bounding_box']]
            except:
                pass

        # total_duration
        if self.lowering_milestones['start_dt'] and self.lowering_milestones['stop_dt']:
            self.lowering_stats['total_duration'] = self.lowering_milestones['stop_dt'] - self.lowering_milestones['start_dt']
           
        # descent_duration
        if self.lowering_milestones['start_dt'] and self.lowering_milestones['on_bottom_dt']:
            self.lowering_stats['descent_duration'] = self.lowering_milestones['on_bottom_dt'] - self.lowering_milestones['start_dt']

        # on_bottom_duration
        if self.lowering_milestones['on_bottom_dt'] and self.lowering_milestones['off_bottom_dt']:
            self.lowering_stats['on_bottom_duration'] = self.lowering_milestones['off_bottom_dt'] - self.lowering_milestones['on_bottom_dt']

        # ascent_duration
        if self.lowering_milestones['off_bottom_dt'] and self.lowering_milestones['stop_dt']:
            self.lowering_stats['ascent_duration'] = self.lowering_milestones['stop_dt'] - self.lowering_milestones['off_bottom_dt']

        # samples
        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")
        self.lowering_stats['samples_collected'] = len(self.lowering_data[idx,:])


    def _build_stat_table(self):

        logger.debug('Building lowering stats table')

        stat_data = [
            [Paragraph('''<b>Start of Dive:</b>''',self.bodyText), self.lowering_milestones['start_dt'], Paragraph('''<b>Total Duration:</b>''',self.bodyText), _strfdelta(self.lowering_stats['total_duration'])],
            [Paragraph('''<b>On Bottom:</b>''',self.bodyText) , self.lowering_milestones['on_bottom_dt'].strftime('%Y-%m-%d %H:%M:%S'), Paragraph('''<b>Decent Duration:</b>''',self.bodyText), _strfdelta(self.lowering_stats['descent_duration'])],
            [Paragraph('''<b>Off Bottom:</b>''',self.bodyText), self.lowering_milestones['off_bottom_dt'].strftime('%Y-%m-%d %H:%M:%S'), Paragraph('''<b>On bottom Duration:</b>''',self.bodyText), _strfdelta(self.lowering_stats['on_bottom_duration'])],
            [Paragraph('''<b>End of Dive:</b>''',self.bodyText), self.lowering_milestones['stop_dt'], Paragraph('''<b>Ascent Duration:</b>''',self.bodyText), _strfdelta(self.lowering_stats['ascent_duration'])],
            [Paragraph('''<b>Max Depth:</b>''',self.bodyText), str(self.lowering_stats['max_depth']) + ' meters' if self.lowering_stats['max_depth'] else '', Paragraph('''<b>Samples Collected:</b>''',self.bodyText), str(self.lowering_stats['samples_collected']) if self.lowering_stats['samples_collected'] else '0'],
            [Paragraph('''<b>Bounding Box:</b>''',self.bodyText), ', '.join([str(pos) for pos in self.lowering_stats['bounding_box']]) if self.lowering_stats['bounding_box'] else '', '', '']
        ]

        stat_table = Table(stat_data, style=[
                                                ('BOX',(0,0),(-1,-1),1,colors.black),
                                                ('LINEAFTER',(1,0),(1,4),1,colors.black),
                                                ('LINEBELOW',(0,0),(-1,-1),1,colors.black)
                                            ])
        stat_table._argW[0]=1.2*inch
        stat_table._argW[1]=2.05*inch

        return stat_table


    def _build_depth_plot(self):

        logger.debug('Building depth plot')

        depth_plot_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_depth_plot.png")
        start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        if not start_ts:
            return None

        fig = go.Figure()

        if 'vehicleRealtimeNavData.depth_value' not in self.lowering_data_headers:
            logger.error("No depth data captured.")
            x_ts = list()
            y_depth = list()

            fig.add_annotation(
                go.layout.Annotation(
                    y=0.5,
                    text="No Data Captured",
                    opacity=0.1,
                    font=dict(color="black", size=60),
                )
            )

        else:
            x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
            y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                x=x_ts,
                y=y_depth
            ))

        fig.update_layout(
            title={
                'text': "Depth Profile",
                'y':0.95,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            yaxis = dict(autorange = 'reversed'),
            yaxis_title="Meters",
            xaxis_tickformat = '%H:%M',
            xaxis_title="Elapse Time",
            autosize=False,
            height=3*inch,
            margin=go.layout.Margin(
                l=25,
                r=0,
                b=25,
                t=35,
                pad=4
            )
        )

        fig.write_image(depth_plot_filename)

        return depth_plot_filename


    def _build_depths_plot(self):

        logger.debug('Building depths plot')

        depths_plot_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_depths_plot.png")
        start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        if not start_ts:
            return None

        fig = go.Figure()

        error_row=0

        if 'vehicleRealtimeNavData.depth_value' not in self.lowering_data_headers:
            logger.warning("No Sprint depth data captured.")
            x_ts = list()
            y_depth = list()

            fig.add_trace(go.Scatter(
                name='Sprint Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        else:
            x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
            y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                name='Sprint Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logger.warning("No CTD depth data captured.")
            x_ts = list()
            y_depth = list()

            fig.add_trace(go.Scatter(
                name='CTD Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        else:
            x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
            y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                name='CTD Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        if 'vehicleRealtimeParoData.depth_value' not in self.lowering_data_headers:
            logger.warning("No Paro depth data captured.")
            x_ts = list()
            y_depth = list()

            fig.add_trace(go.Scatter(
                name='Paro Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        else:
            x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
            y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeParoData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                name='Paro Depth',
                x=x_ts,
                y=y_depth,
                showlegend=True
            ))

        fig.update_layout(
            title={
                'text': "Depth Sensor Profiles",
                'y':.95,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            yaxis = dict(autorange = 'reversed'),
            yaxis_title="Meters",
            xaxis_tickformat = '%H:%M',
            xaxis_title="Elapse Time",
            # autosize=False,
            # height=3*inch,
            margin=go.layout.Margin(
                l=25,
                r=0,
                b=25,
                t=50,
                pad=4
            )
        )

        fig.write_image(depths_plot_filename)

        return depths_plot_filename


    def _build_dive_track(self):

        logger.debug('Building dive track')

        dive_track_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_dive_track.png")

        start_ts = next((ts for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]] if ts is not None), None)

        if not start_ts:
            return None

        fig = go.Figure()

        if 'vehicleRealtimeNavData.longitude_value' not in self.lowering_data_headers:
            logger.warning("No navigational data captured.")
            lon = list()
            lat = list()

            fig.add_trace(go.Scattergeo(
                mode = "lines",
                lon = lon,
                lat = lat,
                text = "Trackline"
            ))

            fig.add_annotation(
                go.layout.Annotation(
                    # x=0.5,
                    # y=0.5,
                    text="No Data Captured",
                    textangle=-25,
                    opacity=0.4,
                    font=dict(color="black", size=60),
                )
            )

        else:
            lon = [ float(lonStr[0]) if lonStr[0] else None for lonStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.longitude_value' )]]]
            lat = [ float(latStr[0]) if latStr[0] else None for latStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.latitude_value' )]]]

            start_lon = [next((lon_pos for lon_pos in lon if lon_pos is not None), None)]
            start_lat = [next((lat_pos for lat_pos in lat if lat_pos is not None), None)]

            stop_lon = [next((lon_pos for lon_pos in reversed(lon) if lon_pos is not None), None)]
            stop_lat = [next((lat_pos for lat_pos in reversed(lat) if lat_pos is not None), None)]

            fig.add_trace(go.Scattergeo(
                mode = "lines",
                lon = lon,
                lat = lat,
                text = "Trackline"
            ))

            fig.add_trace(go.Scattergeo(
                mode = "markers+text",
                lon = start_lon,
                lat = start_lat,
                marker=go.scattergeo.Marker(
                    color="#00CC00",
                    size=20
                ),
                text = ["Start"],
                textposition='top center'

            ))

            fig.add_trace(go.Scattergeo(
                mode = "markers+text",
                lon = stop_lon,
                lat = stop_lat,
                marker=go.scattergeo.Marker(
                    color="#CC0000",
                    size=20
                ),
                text = ["Stop"],
                textposition='top center'
            ))

            fig.update_geos(fitbounds="locations")

        fig.update_layout(
            title={
                'text': "Dive Track",
                'y':0.9,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            title_text='Dive Track',
            showlegend=False,
            geo = dict(
                showland = True,
                showcountries = True,
                showocean = True,
                countrywidth = 0.5,
                landcolor = '#FFF2AF',
                lakecolor = '#E5ECF6',
                oceancolor = '#E5ECF6',
                lataxis = dict(
                    showgrid = True,
                    # dtick = 1
                ),
                lonaxis = dict(
                    showgrid = True,
                    # dtick = 1
                ),
            ),
            margin=go.layout.Margin(
                l=0,
                r=0,
                b=0,
                t=0,
                pad=4,
                autoexpand=True
            )
        )

        fig.write_image(dive_track_filename)

        return dive_track_filename


    def _build_downcast_svp(self):

        logger.debug('Building downcast svp')

        downcast_svp_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_downcast_svp.png")

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['on_bottom_dt']))

        descent_data = self.lowering_data[idx,:]

        fig = go.Figure()

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logger.warning("No CTD data captured.")
            x = list()
            y = list()
            fig.add_annotation(
                go.layout.Annotation(
                    # x=0.5,
                    # y=0.5,
                    text="No Data Captured",
                    textangle=-25,
                    opacity=0.1,
                    font=dict(color="black", size=60),
                )
            )
        else:
            x = [ float(data[0]) if data[0] else None for data in descent_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sv_value' )]]]
            y = [ float(data[0]) if data[0] else None for data in descent_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                mode = "lines",
                x = x,
                y = y,
                text = "SVP"
            ))

        fig.update_layout(
            yaxis = dict(autorange = 'reversed'),
            yaxis_title="Meters",
            xaxis_title="m/s",
            title={
                'text': "Downcast SVP",
                'y':0.95,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            showlegend=False,
            autosize=False,
            margin=go.layout.Margin(
                l=25,
                r=0,
                b=25,
                t=50,
                pad=4
            )
        )

        fig.write_image(downcast_svp_filename)

        return downcast_svp_filename


    def _build_upcast_svp(self):

        logger.debug('Building upcast svp')

        upcast_svp_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_upcast_svp.png")

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['stop_dt']))

        descent_data = self.lowering_data[idx,:]

        fig = go.Figure()

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logger.warning("No CTD data captured.")
            x = list()
            y = list()
            fig.add_annotation(
                go.layout.Annotation(
                    # x=0.5,
                    # y=0.5,
                    text="No Data Captured",
                    textangle=-25,
                    opacity=0.1,
                    font=dict(color="black", size=60),
                )
            )
        else:
            x = [ float(data[0]) if data[0] else None for data in descent_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sv_value' )]]]
            y = [ float(data[0]) if data[0] else None for data in descent_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

            fig.add_trace(go.Scatter(
                mode = "lines",
                x = x,
                y = y,
                text = "SVP"
            ))

        fig.update_layout(
            yaxis = dict(autorange = 'reversed'),
            yaxis_title="Meters",
            xaxis_title="m/s",
            title={
                'text': "Upcast SVP",
                'y':0.95,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            showlegend=False,
            autosize=False,
            margin=go.layout.Margin(
                l=25,
                r=0,
                b=25,
                t=50,
                pad=4
            )
        )

        fig.write_image(upcast_svp_filename)

        return upcast_svp_filename


    def _build_sample_tables(self):

        # +-----------------------------------------------------+
        # | Sample ID:                                          |
        # +--------------------------+--------------------------+
        # | Timestamp:               |                          |
        # +--------------------------+                          |
        # | Lat:                     |                          |
        # +--------------------------+                          |
        # | Lng:                     |          Picture         |
        # +--------------------------+                          |
        # | Depth:                   |                          |
        # +--------------------------+                          |
        # | Location:                |                          |
        # +--------------------------+--------------------------+
        # | Text:                                               |
        # +-----------------------------------------------------+
        # | Comment:                                            |
        # +-----------------------------------------------------+
        logger.debug('Building lowering sample tables')

        global tmpDir

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")

        sample_data = self.lowering_data[idx,:]

        if len(sample_data) == 0:
            return list()

        sample_tables = list()

        for row in range(len(sample_data)):

            if 'vehicleRealtimeFramegrabberData.filename_value' not in self.lowering_data_headers or not sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')]:
                logger.warning('No framegrabber data for SAMPLE event.')
                I = "NO IMAGE AVAILABLE"

            else:
                fd, thumbnail = tempfile.mkstemp(suffix=".jpg", dir=tmpDir)
                try:
                    # print(thumbnail)
                    _resize_image(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')],thumbnail,(960,540))

                    I = Image(thumbnail)
                    I.drawHeight = 3*inch*I.drawHeight / I.drawWidth
                    I.drawWidth = 3*inch
                except:
                    logger.warning("Image file for SAMPLE event not found: " + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')])
                    I = "IMAGE FILE NOT FOUND!"
                    pass

            # print("image:", sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')])

            sample_table_data = [
                [Paragraph('''<b>Sample:</b> ''', self.bodyText), sample_data[row,self.lowering_data_headers.index('event_option.id')], ''],
                [Paragraph('''<b>Date/Time:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('ts')].astype('datetime64[s]'), I],
                [Paragraph('''<b>Lat:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_value')] if 'vehicleRealtimeNavData.latitude_value' in self.lowering_data_headers else 'No Data', ''],
                [Paragraph('''<b>Lon:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_value')] if 'vehicleRealtimeNavData.longitude_value' in self.lowering_data_headers else 'No Data', ''],
                [Paragraph('''<b>Depth:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_value')] if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers else 'No Data', ''],
                [Paragraph('''<b>Type:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('event_option.type')], ''],
                [Paragraph('''<b>Location:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('event_option.storage_location')], ''],
                [Paragraph('''<b>Text:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('event_free_text')], '', ''],
                [Paragraph('''<b>Comment:</b>''',self.bodyText), sample_data[row,self.lowering_data_headers.index('event_option.event_comment')] if 'event_option.event_comment' in self.lowering_data_headers else '', '', '']
            ]

            sample_table = Table(sample_table_data, style=[
                                                            ('BOX',(0,0),(-1,-1),1,colors.black),
                                                            ('LINEAFTER',(1,1),(1,6),1,colors.black),
                                                            ('LINEBELOW',(0,0),(-1,0),1,colors.black),
                                                            ('LINEBELOW',(0,0),(1,5),1,colors.black),
                                                            ('LINEBELOW',(0,6),(-1,-1),1,colors.black),
                                                            ('SPAN',(2,1),(-1,6)),
                                                            ('ALIGN',(2,1),(-1,6), 'CENTER'),
                                                            ('VALIGN',(2,1),(-1,6), 'MIDDLE'),
                                                            ('VALIGN',(0,6),(0,-1), 'TOP'),
                                                            ('NOSPLIT', (0, 0), (-1, -1))
                                                          ])
            sample_table._argW[0]=1.2*inch
            sample_table._argW[1]=2*inch
            sample_table._argW[2]=3*inch

            sample_tables.append(sample_table)

        return sample_tables


    def _build_event_breakdown_table(self):
        logger.debug('Building event breakdown table')

        (unique, counts) = np.unique(self.lowering_data[:, self.lowering_data_headers.index('event_value')], return_counts=True)
        frequencies = np.asarray((unique, counts)).T


        event_breakdown_table_data = [
            [Paragraph('''<b>Event Value:</b>''',self.bodyText), Paragraph('''<b>Count:</b>''',self.bodyText),Paragraph('''<b>%:</b>''',self.bodyText)]
        ]

        for row in range(len(frequencies)):

            event_breakdown_table_data.append([
                frequencies[row,0],
                frequencies[row,1],
                (100 * frequencies[row,1].astype('int')/len(self.lowering_data)).round(2)
            ])


        event_breakdown_table = Table(event_breakdown_table_data, style=[
                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                        ('LINEAFTER',(0,0),(-1,-1),1,colors.black),
                                        ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                        ('NOSPLIT', (0, 0), (-1, -1))
                                      ])

        event_breakdown_table._argW[0]=2*inch
        event_breakdown_table._argW[1]=.75*inch
        event_breakdown_table._argW[2]=.75*inch

        return event_breakdown_table


    def _build_watch_change_table(self):

        logger.debug('Building watch_change tables')

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]

        if len(watch_change_data) == 0:
            return None

        watch_change_table_data = [
            [Paragraph('''<b>Date/Time:</b>''',self.bodyText), Paragraph('''<b>Pilot:</b>''',self.bodyText),Paragraph('''<b>Co-Pilot:</b>''',self.bodyText),Paragraph('''<b>Datalogger:</b>''',self.bodyText)],           
        ]
        for row in range(len(watch_change_data)):

            watch_change_table_data.append([
                watch_change_data[row,self.lowering_data_headers.index('ts')].astype('datetime64[m]'),
                watch_change_data[row,self.lowering_data_headers.index('event_option.pilot')],
                watch_change_data[row,self.lowering_data_headers.index('event_option.co-pilot')],
                watch_change_data[row,self.lowering_data_headers.index('event_option.datalogger')]
            ])

        watch_change_table = Table(watch_change_table_data, style=[
                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                    ('LINEAFTER',(0,0),(-1,-1),1,colors.black),
                                    ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                    ('NOSPLIT', (0, 0), (-1, -1))
                                  ])

        watch_change_table._argW[0]=1.5*inch
        watch_change_table._argW[1]=1*inch
        watch_change_table._argW[2]=1*inch
        watch_change_table._argW[3]=1*inch

        return watch_change_table


    def _build_watch_change_graph(self):

        logger.debug('Building watch_change graphs')

        operator_hours_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_operator_hours.png")

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]
       
        fig = go.Figure()

        if len(watch_change_data) == 0:

            x = list()
            y = list()
            fig.add_annotation(
                go.layout.Annotation(
                    text="No Data Captured",
                    textangle=-25,
                    opacity=0.1,
                    font=dict(color="black", size=60),
                )
            )

        else:

            col_names = list(['id','ts','event_option.co-pilot','event_option.datalogger','event_option.pilot',])
            cols = np.array([header_name in col_names for header_name in self.lowering_data_headers])

            pilots = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.pilot')])
            pilots = pilots[pilots != np.array('')]
            pilot_hours = np.stack((pilots, np.zeros([len(pilots)])), axis=1)

            co_pilots = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.co-pilot')])
            co_pilots = co_pilots[co_pilots != np.array('')]
            co_pilot_hours = np.stack((co_pilots, np.zeros([len(co_pilots)])), axis=1)

            dataloggers = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.datalogger')])
            dataloggers = dataloggers[dataloggers != np.array('')]
            datalogger_hours = np.stack((dataloggers, np.zeros([len(dataloggers)])), axis=1)

            manhours = pd.DataFrame(data=watch_change_data[0:,cols], # values
                index=watch_change_data[0:,0],                       # 1st column as index
                columns=col_names)                                   # column names

            manhours['ts'] = pd.to_datetime(manhours['ts'], infer_datetime_format=True) # transfrom string to datetime
            manhours['time_diff'] = 0

            for i in range(manhours.shape[0]-1):
                manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

            manhours['time_diff'][-1] = (self.lowering_milestones['stop_dt'] - manhours['ts'][-1]).total_seconds()
            # print(manhours)

            for row in range(len(pilot_hours)):
                pilot_hours[row,1] = manhours.loc[manhours['event_option.pilot'] == pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(pilot_hours)

            for row in range(len(co_pilot_hours)):
                co_pilot_hours[row,1] = manhours.loc[manhours['event_option.co-pilot'] == co_pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(co_pilot_hours)

            for row in range(len(datalogger_hours)):
                datalogger_hours[row,1] = manhours.loc[manhours['event_option.datalogger'] == datalogger_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(datalogger_hours)

            fig.add_trace(go.Bar(
                x = pilot_hours[:,0],
                y = pilot_hours[:,1],
                name = "Pilot"
            ))

            fig.add_trace(go.Bar(
                x = datalogger_hours[:,0],
                y = datalogger_hours[:,1],
                name = "Datalogger"
            ))

            fig.add_trace(go.Bar(
                x = co_pilot_hours[:,0],
                y = co_pilot_hours[:,1],
                name = "Co-Pilot"
            ))

        fig.update_layout(
            barmode="stack",
            title={
                'text': "Operator Hours",
                'y':0.95,
                'x':0.5,
                'xanchor': 'center',
                'yanchor': 'top'
            },
            yaxis_tickformat = '%H:%M',
            showlegend=True,
            autosize=False,
            margin=go.layout.Margin(
                l=25,
                r=0,
                b=25,
                t=50,
                pad=4
            )
        )

        fig.write_image(operator_hours_filename)

        return operator_hours_filename


    def _build_watch_change_summary_table(self):

        logger.debug('Building watch_change summary table')

        operator_hours_filename = os.path.join(self.output_path,self.lowering_uid,self.lowering_record['lowering_id']+ "_operator_hours.png")

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]
       
        if len(watch_change_data) == 0:

            return None

        else:

            col_names = list(['id','ts','event_option.co-pilot','event_option.datalogger','event_option.pilot',])
            cols = np.array([header_name in col_names for header_name in self.lowering_data_headers])

            pilots = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.pilot')])
            pilots = pilots[pilots != np.array('')]
            pilot_hours = np.stack((pilots, np.zeros([len(pilots)])), axis=1)

            co_pilots = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.co-pilot')])
            co_pilots = co_pilots[co_pilots != np.array('')]
            co_pilot_hours = np.stack((co_pilots, np.zeros([len(co_pilots)])), axis=1)

            dataloggers = np.unique(watch_change_data[:, self.lowering_data_headers.index('event_option.datalogger')])
            dataloggers = dataloggers[dataloggers != np.array('')]
            datalogger_hours = np.stack((dataloggers, np.zeros([len(dataloggers)])), axis=1)

            operators = np.concatenate((pilots, co_pilots, dataloggers))
            operators = np.unique(operators)
            # print(operators)

            operator_hours = np.column_stack((operators, np.zeros((len(operators),4))))
            # print(operator_hours

            manhours = pd.DataFrame(data=watch_change_data[0:,cols],  # values
                                    index=watch_change_data[0:,0],    # 1st column as index
                                    columns=col_names)                # column names

            manhours['ts'] = pd.to_datetime(manhours['ts'], infer_datetime_format=True) # transfrom string to datetime
            manhours['time_diff'] = 0

            for i in range(manhours.shape[0]-1):
                manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

            manhours['time_diff'][-1] = (self.lowering_milestones['stop_dt'] - manhours['ts'][-1]).total_seconds()
            # print(manhours)

            for row in range(len(pilot_hours)):
                pilot_hours[row,1] = manhours.loc[manhours['event_option.pilot'] == pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(pilot_hours)

            for row in range(len(co_pilot_hours)):
                co_pilot_hours[row,1] = manhours.loc[manhours['event_option.co-pilot'] == co_pilot_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(co_pilot_hours)

            for row in range(len(datalogger_hours)):
                datalogger_hours[row,1] = manhours.loc[manhours['event_option.datalogger'] == datalogger_hours[row,0], 'time_diff'].sum().astype('datetime64[s]')
            # print(datalogger_hours)

            for row in range(len(operator_hours)):
                operator_hours[row,1] = manhours.loc[manhours['event_option.pilot'] == operator_hours[row,0], 'time_diff'].sum()
                operator_hours[row,2] = manhours.loc[manhours['event_option.co-pilot'] == operator_hours[row,0], 'time_diff'].sum()
                operator_hours[row,3] = manhours.loc[manhours['event_option.datalogger'] == operator_hours[row,0], 'time_diff'].sum()
                operator_hours[row,4] = np.sum(operator_hours[row,1:4].astype('int'))
            # print(operator_hours)

            watch_change_table_data = [
               ['', Paragraph('''<b>Pilot:</b>''',self.bodyText),Paragraph('''<b>Co-Pilot:</b>''',self.bodyText),Paragraph('''<b>Datalogger:</b>''',self.bodyText),Paragraph('''<b>Total:</b>''',self.bodyText)],           
            ]

            for row in range(len(operator_hours)):

                watch_change_table_data.append([
                    operator_hours[row,0],
                    _strfdelta(datetime.utcfromtimestamp(operator_hours[row,1].astype('int')) - datetime.fromisoformat('1970-01-01')),
                    _strfdelta(datetime.utcfromtimestamp(operator_hours[row,2].astype('int')) - datetime.fromisoformat('1970-01-01')),
                    _strfdelta(datetime.utcfromtimestamp(operator_hours[row,3].astype('int')) - datetime.fromisoformat('1970-01-01')),
                    _strfdelta(datetime.utcfromtimestamp(operator_hours[row,4].astype('int')) - datetime.fromisoformat('1970-01-01'))
                ])

                watch_change_summary_table = Table(watch_change_table_data, style=[
                                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                                    ('LINEAFTER',(0,0),(-1,-1),1,colors.black),
                                                    ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                                    ('NOSPLIT', (0, 0), (-1, -1))
                                                  ])

                watch_change_summary_table._argW[0]=1*inch
                watch_change_summary_table._argW[1]=1.25*inch
                watch_change_summary_table._argW[2]=1.25*inch
                watch_change_summary_table._argW[3]=1.25*inch
                watch_change_summary_table._argW[4]=1.25*inch

        return watch_change_summary_table


    def _build_problem_tables(self):

        # +-----------------------------+-----------------------+
        # | Timestamp:                  | Type:                 |
        # +-----------------------------+-----------------------+
        # | Text:                                               |
        # +-----------------------------------------------------+
        # | Comment:                                            |
        # +-----------------------------------------------------+
        logger.debug('Building problem tables')

        # global tmpDir

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "PROBLEM")

        problem_data = self.lowering_data[idx,:]

        if len(problem_data) == 0:
            return list()

        problem_tables = list()

        for row in range(len(problem_data)):

            problem_table_data = [
                [Paragraph('''<b>Type:</b>''',self.bodyText), problem_data[row,self.lowering_data_headers.index('event_option.type')],Paragraph('''<b>Date/Time:</b>''',self.bodyText), problem_data[row,self.lowering_data_headers.index('ts')].astype('datetime64[s]')],
                [Paragraph('''<b>Text:</b>''',self.bodyText), problem_data[row,self.lowering_data_headers.index('event_free_text')], ''],
                [Paragraph('''<b>Comment:</b>''',self.bodyText), problem_data[row,self.lowering_data_headers.index('event_option.event_comment')] if 'event_option.event_comment' in self.lowering_data_headers else '', '']
            ]

            problem_table = Table(problem_table_data, style=[
                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                    ('LINEAFTER',(1,0),(1,0),1,colors.black),
                                    ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                    ('VALIGN',(0,1),(0,-1),'TOP'),
                                    ('SPAN',(1,1),(-1,1)),
                                    ('SPAN',(1,2),(-1,2)),
                                    ('NOSPLIT', (0, 0), (-1, -1))
                                 ])

            problem_table._argW[0]=.95*inch
            problem_table._argW[1]=1.6*inch
            problem_table._argW[2]=.95*inch
            problem_table._argW[3]=1.6*inch

            problem_tables.append(problem_table)

        return problem_tables


    def build_pdf(self):
        pdf_buffer = BytesIO()
        my_doc = RLDocTemplate(
            pdf_buffer,
            pagesize=defaultPageSize,
            leftMargin=BASE_MARGIN,
            rightMargin=BASE_MARGIN,
            topMargin=BASE_MARGIN,
            bottomMargin=BASE_MARGIN,
            title="Dive Summary Report: " + self.lowering_record['lowering_id'],
            author="Schmidt Ocean Institute"
        )

        location = ''
        if self.lowering_record['lowering_location']:
            location = self.lowering_record['lowering_location']

        description = ''
        if self.lowering_record['lowering_additional_meta']['lowering_description']:
            description = self.lowering_record['lowering_additional_meta']['lowering_description']

        stat_table = self._build_stat_table()
        sample_tables = self._build_sample_tables()
        watch_change_table = self._build_watch_change_table()
        watch_change_summary_table = self._build_watch_change_summary_table()
        problem_tables = self._build_problem_tables()
        event_breakdown_table = self._build_event_breakdown_table()

        depth_plot_filename = self._build_depth_plot()
        depth_plot = Image(depth_plot_filename)
        depth_plot._restrictSize(PAGE_WIDTH - 2 * inch, 4 * inch)
        depth_plot.hAlign = 'CENTER'

        depths_plot_filename = self._build_depths_plot()
        depths_plot = Image(depths_plot_filename)
        depths_plot._restrictSize(PAGE_WIDTH - 2 * inch, PAGE_HEIGHT - 2 * inch)
        depths_plot.hAlign = 'CENTER'

        downcast_svp_filename = self._build_downcast_svp()
        downcast_svp = Image(downcast_svp_filename)
        downcast_svp._restrictSize(PAGE_WIDTH - 2 * inch, 4.25 * inch)
        downcast_svp.hAlign = 'CENTER'

        upcast_svp_filename = self._build_upcast_svp()
        upcast_svp = Image(upcast_svp_filename)
        upcast_svp._restrictSize(PAGE_WIDTH - 2 * inch, 4.1 * inch)
        upcast_svp.hAlign = 'CENTER'

        watch_change_filename = self._build_watch_change_graph()
        watch_change_plot = Image(watch_change_filename)
        watch_change_plot._restrictSize(PAGE_WIDTH - 2 * inch, 4.1 * inch)
        watch_change_plot.hAlign = 'CENTER'

        dive_track_filename = self._build_dive_track()
        dive_track = Image(dive_track_filename)
        dive_track._restrictSize(PAGE_WIDTH - 2 * inch, PAGE_HEIGHT - 2 * inch)
        dive_track.hAlign = 'CENTER'

        # toc = tableofcontents.TableOfContents()
        # toc.levelStyles = [self.heading1, self.heading2]

        logger.debug("Building flowables array")

        flowables = [

            Paragraph("<b>Dive Number:</b> " + self.lowering_record['lowering_id'], self.bodyText),
            Paragraph("<b>Dive Summary:</b> ", self.bodyText),
            Paragraph(description, self.bodyText),
            Paragraph("<b>Dive Location:</b> " + location, self.bodyText),
            Paragraph("<b>Dive Stats:</b> ", self.bodyText),
            Spacer(PAGE_WIDTH, 0.125*inch),
            stat_table,
            Spacer(PAGE_WIDTH, 0.25*inch),
            event_breakdown_table,
            # NextPageTemplate("TOC"),
            # PageBreak(),
            # toc,
            NextPageTemplate("Normal"),
            PageBreak(),
            Paragraph("Maps and Plots:", self.heading1),
            Paragraph("Dive Track and Depth Profile:", self.heading2),
            dive_track,
            Spacer(PAGE_WIDTH, 0.125*inch),
            depth_plot,
            Spacer(PAGE_WIDTH, 0.125*inch),
            depths_plot,
            PageBreak(),
            Paragraph("Sound Velocity Profiles:", self.heading2),
            downcast_svp,
            Spacer(PAGE_WIDTH, 0.125*inch),
            upcast_svp,
            PageBreak()
        ]

        flowables.append(Paragraph("Samples:", self.heading1))
        if len(sample_tables) == 0:
            flowables.append(Paragraph("No SAMPLE events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 0.125*inch))

        else:
            for table in range(len(sample_tables)):
                flowables.append(sample_tables[table])
                flowables.append(Spacer(PAGE_WIDTH, 0.25*inch))
            flowables.append(PageBreak())

        flowables.append(Paragraph("Watch Changes:", self.heading1))
        if not watch_change_table:
            flowables.append(Paragraph("No WATCH CHANGE events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 0.125*inch))

        else:
            flowables.append(Paragraph("Summary:", self.heading2))
            flowables.append(watch_change_summary_table)
            flowables.append(Spacer(PAGE_WIDTH, 0.125*inch))
            flowables.append(watch_change_plot)
            flowables.append(PageBreak())
            flowables.append(Paragraph("Watch Change Events:", self.heading2))
            flowables.append(watch_change_table)
            flowables.append(Spacer(PAGE_WIDTH, 0.125*inch))
            flowables.append(PageBreak())

        flowables.append(Paragraph("Problems:", self.heading1))
        if len(problem_tables) == 0:
            flowables.append(Paragraph("No PROBLEM events recorded for this dive", self.bodyText))
            flowables.append(Spacer(PAGE_WIDTH, 0.125*inch))

        else:
            for table in range(len(problem_tables)):
                flowables.append(problem_tables[table])
                flowables.append(Spacer(PAGE_WIDTH, 0.25*inch))
            flowables.append(PageBreak())

        logger.debug('Building report')

        my_doc.build(
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

    parser = argparse.ArgumentParser(description='ASNAP event submission service')
    parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
    # parser.add_argument('-o', '--output_path', help='where to save the output report')
    parser.add_argument('lowering_id', help='lowering_id to build report for (i.e. S0312).')

    args = parser.parse_args()

  # Turn on debug mode
    if args.debug:
        logger.info("Setting log level to DEBUG")
        logger.setLevel(logging.DEBUG)
        for handler in logger.handlers:
            handler.setLevel(logging.DEBUG)
        logger.debug("Log level now set to DEBUG")

    OUTPUT_FILENAME = args.lowering_id + '_loweringReport.pdf'

    #verify lowering exists
    lowering_uid = getLoweringUIDByID(args.lowering_id)

    if lowering_uid == None:
        logger.error("No lowering found for lowering_id: " + args.lowering_id)
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)

    LOWERING_PATH = os.path.join(apiServerFilePath, 'lowerings')
    OUTPUT_PATH = os.path.join(LOWERING_PATH, lowering_uid)

    tmpDir = tempfile.mkdtemp()
   
    PDF = PdfCreator(lowering_uid, LOWERING_PATH)

    try:
        f = open(os.path.join(OUTPUT_PATH, OUTPUT_FILENAME), 'wb')
        f.write(PDF.build_pdf())
        f.close()
   
    except Exception as error:
        logger.error("Unable to build report")
        logger.error(str(error))

    finally:
        shutil.rmtree(tmpDir, ignore_errors=True)





