
import logging
import shutil
import os
import math
from io import BytesIO
from string import Formatter
from reportlab.platypus import NextPageTemplate, Paragraph, PageBreak, Table, Spacer, Image
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics import renderPDF
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from datetime import datetime, timedelta
from PIL import Image as pil_Image

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as ticker
from mpl_toolkits.basemap import Basemap

from reporting.sealog_rl_doc_template import RLDocTemplate 

import numpy as np
import pandas as pd
from svglib.svglib import svg2rlg
import csv
import tempfile

from python_sealog.settings import apiServerURL, apiServerFilePath, cruisesAPIPath, eventsAPIPath, customVarAPIPath, headers
from python_sealog.lowerings import getLowering, getLoweringsByCruise, getLoweringUIDByID
from python_sealog.cruises import getCruise, getCruiseByLowering
from python_sealog.events import getEventsByLowering
from python_sealog.event_exports import getEventExportsByLowering
from python_sealog.event_templates import getEventTemplates

pd.set_option('mode.chained_assignment', None)

defaultPageSize = A4

PAGE_WIDTH, PAGE_HEIGHT= defaultPageSize
BASE_MARGIN = 5 * mm

def _seconds_to_hours_formatter(x, pos):
    """
    Convert x from seconds to hh:mm
    """
    return '%d:00' % (x//3600)

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

# def _scale(drawing, scaling_factor):
#     """
#     Scale a reportlab.graphics.shapes.Drawing()
#     object while maintaining the aspect ratio
#     """
#     scaling_x = scaling_y = scaling_factor
   
#     drawing.width = drawing.minWidth() * scaling_x
#     drawing.height = drawing.height * scaling_y
#     drawing.scale(scaling_x, scaling_y)
#     return drawing

def _resize_image(input_image_path, output_image_path, size):
    """
    Resize the input image to the specified size and return the name
    of the resized output file
    """
    original_image = pil_Image.open(input_image_path)
    width, height = original_image.size
    resized_image = original_image.resize(size)
    width, height = resized_image.size
    resized_image.save(output_image_path)


class SOICruiseReportCreator:

    def __init__(self, cruise_uid):
        sample_style_sheet = getSampleStyleSheet()
        self.bodyText = sample_style_sheet['BodyText']
        self.coverHeader = ParagraphStyle(
                                        'CoverHeader',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=12,
                                        fontName='Helvetica-Bold'
                                       )
        self.tableText = ParagraphStyle(
                                        'TableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2
                                       )
        self.tableTextCentered = ParagraphStyle(
                                        'TableTextCentered',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2,
                                        alignment=1
                                       )
        self.eventTableText = ParagraphStyle(
                                        'EventTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=0,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summaryTableText = ParagraphStyle(
                                        'SummaryTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summaryTableD2DText = ParagraphStyle(
                                        'SummaryD2DTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=9,
                                        leading=8
                                       )
        self.sampleTableText = ParagraphStyle(
                                        'SampleTableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=5,
                                        # spaceAfter=2,
                                        leading=5
                                       )
        self.tocHeading1 = ParagraphStyle(
                                            'TOCHeading1',
                                            parent=sample_style_sheet['Heading1'],
                                            fontSize=12,
                                            leftIndent=20,
                                            firstLineIndent=-20,
                                            spaceBefore=10,
                                            leading=16
                                        )
        self.tocHeading2 = ParagraphStyle(
                                            'TOCHeading2',
                                            parent=sample_style_sheet['Heading2'],
                                            fontSize=10,
                                            leftIndent=40,
                                            firstLineIndent=-20,
                                            spaceBefore=0,
                                            leading=12
                                        )

        self.heading1 = sample_style_sheet['Heading1']
        self.heading2 = sample_style_sheet['Heading2']

        self.cruise_record = getCruise(cruise_uid)

        self.lowering_records = getLoweringsByCruise(cruise_uid) if self.cruise_record else list()
        self.lowering_records.reverse()

        for lowering in self.lowering_records:
            logging.debug(lowering['lowering_id'])
            lowering['stats'], lowering['milestones'] = self._build_lowering_stats(lowering)


    def __del__(self):

        try:
            shutil.rmtree(self.tmpDir, ignore_errors=True)
        except AttributeError:
            pass


    def _build_lowering_stats(self, lowering):

        logging.debug('Building lowering stats data for lowering: ' + lowering['lowering_id'])

        lowering_milestones = dict(
            start_dt = None,
            off_deck_dt = None,
            descending_dt = None,
            on_bottom_dt = None,
            off_bottom_dt = None,
            floats_on_surface_dt = None,
            stop_dt = None
        )

        lowering_stats = dict(
            max_depth = 0,
            bounding_box = None,
            total_duration = None,
            deployment_duration = None,
            descent_duration = None,
            on_bottom_duration = None,
            ascent_duration = None,
            recovery_duration = None,
            samples_collected = None
        )

        if lowering['start_ts']:
            try:
                lowering_milestones['start_dt'] = datetime.fromisoformat(lowering['start_ts'][:-1])
            except:
                pass

        if lowering['stop_ts']:
            try:
                lowering_milestones['stop_dt'] = datetime.fromisoformat(lowering['stop_ts'][:-1])
            except:
                pass

        if 'milestones' in lowering['lowering_additional_meta'] and 'lowering_off_deck' in lowering['lowering_additional_meta']['milestones']:
            try:
                lowering_milestones['off_deck_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_off_deck'][:-1])
            except:
                pass

        if 'milestones' in lowering['lowering_additional_meta'] and 'lowering_descending' in lowering['lowering_additional_meta']['milestones']:
            try:
                lowering_milestones['descending_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_descending'][:-1])
            except:
                pass

        if 'milestones' in lowering['lowering_additional_meta'] and 'lowering_on_bottom' in lowering['lowering_additional_meta']['milestones']:
            try:
                lowering_milestones['on_bottom_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_on_bottom'][:-1])
            except:
                pass

        if 'milestones' in lowering['lowering_additional_meta'] and 'lowering_off_bottom' in lowering['lowering_additional_meta']['milestones']:
            try:
                lowering_milestones['off_bottom_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_off_bottom'][:-1])
            except:
                pass

        if 'milestones' in lowering['lowering_additional_meta'] and 'lowering_floats_on_surface' in lowering['lowering_additional_meta']['milestones']:
            try:
                lowering_milestones['floats_on_surface_dt'] = datetime.fromisoformat(lowering['lowering_additional_meta']['milestones']['lowering_floats_on_surface'][:-1])
            except:
                pass

        if 'stats' in lowering['lowering_additional_meta'] and 'max_depth' in lowering['lowering_additional_meta']['stats']:
            try:
                lowering_stats['max_depth'] = float(lowering['lowering_additional_meta']['stats']['max_depth'])
            except:
                pass

        if 'stats' in lowering['lowering_additional_meta'] and 'bounding_box' in lowering['lowering_additional_meta']['stats']:
            try:
                lowering_stats['bounding_box'] = [float(elem) for elem in lowering['lowering_additional_meta']['stats']['bounding_box']]
            except:
                pass

        # total_duration
        if lowering_milestones['off_deck_dt'] and lowering_milestones['stop_dt']:
            lowering_stats['total_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['off_deck_dt']
           
        # deployment_duration
        if lowering_milestones['off_deck_dt'] and lowering_milestones['descending_dt']:
            lowering_stats['deployment_duration'] = lowering_milestones['descending_dt'] - lowering_milestones['off_deck_dt']

        # descent_duration
        if lowering_milestones['descending_dt'] and lowering_milestones['on_bottom_dt']:
            lowering_stats['descent_duration'] = lowering_milestones['on_bottom_dt'] - lowering_milestones['descending_dt']

        # on_bottom_duration
        if lowering_milestones['on_bottom_dt'] and lowering_milestones['off_bottom_dt']:
            lowering_stats['on_bottom_duration'] = lowering_milestones['off_bottom_dt'] - lowering_milestones['on_bottom_dt']

        # ascent_duration
        if lowering_milestones['off_bottom_dt'] and lowering_milestones['floats_on_surface_dt']:
            lowering_stats['ascent_duration'] = lowering_milestones['floats_on_surface_dt'] - lowering_milestones['off_bottom_dt']

        # recovery_duration
        if lowering_milestones['floats_on_surface_dt'] and lowering_milestones['stop_dt']:
            lowering_stats['recovery_duration'] = lowering_milestones['stop_dt'] - lowering_milestones['floats_on_surface_dt']

        # samples
        event_data = getEventsByLowering(lowering['id'], filter="SAMPLE")
        lowering_stats['samples_collected'] = len(event_data) if event_data else 0

        return lowering_stats, lowering_milestones


    def _build_stat_table(self):

        logging.debug('Building lowering stats table')

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

        totals = dict(
            {
                'total_duration': timedelta(),
                'deployment_duration': timedelta(),
                'descent_duration': timedelta(),
                'on_bottom_duration': timedelta(),
                'ascent_duration': timedelta(),
                'recovery_duration': timedelta(),
                'max_depth': 0,
                'samples_collected': 0,
            }
        )

        for lowering in self.lowering_records:

            totals['total_duration'] += lowering['stats']['total_duration'] if lowering['stats']['total_duration'] else timedelta()
            totals['deployment_duration'] += lowering['stats']['deployment_duration'] if lowering['stats']['deployment_duration'] else timedelta()
            totals['descent_duration'] += lowering['stats']['descent_duration'] if lowering['stats']['descent_duration'] else timedelta()
            totals['on_bottom_duration'] += lowering['stats']['on_bottom_duration'] if lowering['stats']['on_bottom_duration'] else timedelta()
            totals['ascent_duration'] += lowering['stats']['ascent_duration'] if lowering['stats']['ascent_duration'] else timedelta()
            totals['recovery_duration'] += lowering['stats']['recovery_duration'] if lowering['stats']['recovery_duration'] else timedelta()
            if lowering['stats']['max_depth']:
                totals['max_depth'] = lowering['stats']['max_depth'] if lowering['stats']['max_depth'] > totals['max_depth'] else totals['max_depth']

            if lowering['stats']['samples_collected']:
                totals['samples_collected'] += lowering['stats']['samples_collected']

            stat_data.append( [
                lowering['lowering_id'],
                lowering['lowering_location'],
                _strfdelta(lowering['stats']['total_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                _strfdelta(lowering['stats']['deployment_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                _strfdelta(lowering['stats']['descent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                _strfdelta(lowering['stats']['on_bottom_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                _strfdelta(lowering['stats']['ascent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                _strfdelta(lowering['stats']['recovery_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
                str(lowering['stats']['max_depth']) + 'm' if lowering['stats']['max_depth'] else '',
                str(lowering['stats']['samples_collected']) if lowering['stats']['samples_collected'] else '0'
            ])

        stat_data.append([
            'Totals',
            str(len(self.lowering_records)) + ' Dives',
            _strfdelta(totals['total_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            _strfdelta(totals['deployment_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            _strfdelta(totals['descent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            _strfdelta(totals['on_bottom_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            _strfdelta(totals['ascent_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            _strfdelta(totals['recovery_duration'],fmt='{D:02}d {H:02}:{M:02}:{S:02}'),
            str(totals['max_depth']) + 'm',
            totals['samples_collected']

        ])

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


    # def _build_summary_table(self):

    #     logging.debug('Building lowering summary table')

    #     idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "VEHICLE")

    #     vehicle_data = self.lowering_data[idx,:]

    #     svg2imgFile = svg2rlg('./assets/images/dive_information_diagram.svg')
    #     dive_stage_image = Image(svg2imgFile)

    #     dive_stage_image._restrictSize(PAGE_WIDTH/2 - .5 * inch, 4 * inch)
    #     dive_stage_image.hAlign = 'CENTER'

    #     start_of_dive = self.lowering_milestones['start_dt']
    #     off_deck = self.lowering_milestones['off_deck_dt']
    #     first_float_on = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'First float on', vehicle_data)])), None)
    #     last_float_on = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float on', vehicle_data)])), None)
    #     float_num = None
    #     if 'event_option.number_of_floats?' in self.lowering_data_headers:
    #         float_num = next(reversed(list([event[self.lowering_data_headers.index( 'event_option.number_of_floats?' )] for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float on', vehicle_data)])), None)
    #     descending = self.lowering_milestones['descending_dt']
    #     on_bottom = self.lowering_milestones['on_bottom_dt']
    #     off_bottom = self.lowering_milestones['off_bottom_dt']
    #     floats_on_surface = self.lowering_milestones['floats_on_surface_dt']
    #     first_float_off = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'First float off', vehicle_data)])), None)
    #     last_float_off = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float off', vehicle_data)])), None)
    #     on_deck = self.lowering_milestones['stop_dt']

    #     # Deployment Duration (off_deck --> last_float_added)
    #     deployment_duration = None
    #     if off_deck and descending:
    #         deployment_duration = descending - off_deck

    #     # Descent Duration (descending --> on_bottom)
    #     descent_duration = None
    #     if descending and on_bottom:
    #         descent_duration = on_bottom - descending

    #     # On bottom/@ target depth Duration (on_bottom --> off_bottom)
    #     on_bottom_duration = None
    #     if on_bottom and off_bottom:
    #         on_bottom_duration = off_bottom - on_bottom

    #     # Ascent Duration (off_bottom --> floats_on_surface)
    #     ascent_duration = None
    #     if off_bottom and floats_on_surface:
    #         ascent_duration = floats_on_surface - off_bottom

    #     # Recovery Duration (first_float_off --> vehicle_secured)
    #     recovery_duration = None
    #     if floats_on_surface and on_deck:
    #         recovery_duration = on_deck - floats_on_surface

    #     # Deck-to-deck (off_deck --> on_deck)
    #     deck_to_deck_duration = None
    #     if off_deck and on_deck:
    #         deck_to_deck_duration = on_deck - off_deck

    #     summary_data = [
    #         [dive_stage_image],
    #         ['Stage', 'Date/Time', 'Stage Duration', 'Total'],
    #         ['Vehicle Off Deck', off_deck.strftime('%Y-%m-%d %H:%M:%S') if off_deck else '', Paragraph('<b>Deployment:</b><br/>' + _strfdelta(deployment_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableText) if deployment_duration else Paragraph('<b>Deployment</b><br/>n/a', self.summaryTableText) , Paragraph('<b>Deck-to-deck:</b><br/>' + _strfdelta(deck_to_deck_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableD2DText) if deck_to_deck_duration else Paragraph('<b>Deck-to-deck:</b><br/>n/a', self.summaryTableD2DText)],
    #         ['First Float Added', datetime.fromisoformat(first_float_on).strftime('%Y-%m-%d %H:%M:%S') if first_float_on else ''],
    #         ['Last Float Added', datetime.fromisoformat(last_float_on).strftime('%Y-%m-%d %H:%M:%S') if last_float_on else ''],
    #         ['Vehicle Descending', descending.strftime('%Y-%m-%d %H:%M:%S') if descending else '', Paragraph('<b>Descent:</b><br/>' + _strfdelta(descent_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableText) if descent_duration else Paragraph('<b>Descent:</b><br/>n/a', self.summaryTableText)],
    #         ['On Botton/@Target Depth', on_bottom.strftime('%Y-%m-%d %H:%M:%S') if on_bottom else '', Paragraph('<b>On Botton/@Target Depth:</b><br/>' + _strfdelta(on_bottom_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableText) if on_bottom_duration else Paragraph('<b>On Botton/@Target Depth:</b><br/>n/a', self.summaryTableText)],
    #         ['Vehicle Ascending', off_bottom.strftime('%Y-%m-%d %H:%M:%S') if off_bottom else '', Paragraph('<b>Ascent:</b><br/>' + _strfdelta(ascent_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableText) if ascent_duration else Paragraph('<b>Ascent:</b><br/>n/a', self.summaryTableText)],
    #         ['Floats on Surface', floats_on_surface.strftime('%Y-%m-%d %H:%M:%S') if floats_on_surface else ''],
    #         ['First Float Removed', datetime.fromisoformat(first_float_off).strftime('%Y-%m-%d %H:%M:%S'), Paragraph('<b>Recovery:</b><br/>' + _strfdelta(recovery_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableText) if recovery_duration else Paragraph('<b>Recovery:</b><br/>n/a', self.summaryTableText)],
    #         ['Last Float Removed', datetime.fromisoformat(last_float_off).strftime('%Y-%m-%d %H:%M:%S') if last_float_off else ''],
    #         ['Vehicle On Deck', on_deck.strftime('%Y-%m-%d %H:%M:%S') if on_deck else '']
    #     ]

    #     summary_table = Table(summary_data, style=[
    #                                             ('BOX',(0,1),(-1,-1),.5,colors.black),
    #                                             ('GRID',(0,1),(-1,-1),.5,colors.black),
    #                                             ('SPAN',(0,0),(-1,0)),
    #                                             ('SPAN',(2,2),(2,4)),
    #                                             ('SPAN',(2,7),(2,8)),
    #                                             ('SPAN',(2,9),(2,-1)),
    #                                             ('SPAN',(3,2),(3,-1)),
    #                                             ('FONTSIZE',(0,0),(-1,-1),5),
    #                                             ('LEADING',(0,0),(-1,-1),8),
    #                                             ('ALIGNMENT',(0,0),(-1,-1),'CENTER'),
    #                                             ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    #                                             ('BOTTOMPADDING',(0,0),(-1,-1),0),
    #                                             ('TOPPADDING',(0,0),(-1,-1),2),
    #                                             ('BACKGROUND', (0, 1), (-1, 1), colors.lightgrey)
    #                                         ])
    #     summary_table._argW[0]=.9*inch
    #     summary_table._argW[1]=.8*inch
    #     summary_table._argW[2]=1.1*inch
    #     summary_table._argW[3]=.85*inch

    #     return summary_table


class SOILoweringReportCreator:

    def __init__(self, lowering_uid):
        sample_style_sheet = getSampleStyleSheet()
        self.bodyText = sample_style_sheet['BodyText']
        self.coverHeader = ParagraphStyle(
                                        'CoverHeader',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=12,
                                        fontName='Helvetica-Bold'
                                       )
        self.tableText = ParagraphStyle(
                                        'TableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2
                                       )
        self.tableTextCentered = ParagraphStyle(
                                        'TableTextCentered',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=8,
                                        spaceAfter=2,
                                        alignment=1
                                       )
        self.eventTableText = ParagraphStyle(
                                        'EventTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=0,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summaryTableText = ParagraphStyle(
                                        'SummaryTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=5,
                                        leading=8
                                       )
        self.summaryTableD2DText = ParagraphStyle(
                                        'SummaryD2DTableText',
                                        parent=sample_style_sheet['Normal'],
                                        alignment=1,
                                        fontSize=9,
                                        leading=8
                                       )
        self.sampleTableText = ParagraphStyle(
                                        'SampleTableText',
                                        parent=sample_style_sheet['BodyText'],
                                        fontSize=5,
                                        # spaceAfter=2,
                                        leading=5
                                       )
        self.tocHeading1 = ParagraphStyle(
                                            'TOCHeading1',
                                            parent=sample_style_sheet['Heading1'],
                                            fontSize=12,
                                            leftIndent=20,
                                            firstLineIndent=-20,
                                            spaceBefore=10,
                                            leading=16
                                        )
        self.tocHeading2 = ParagraphStyle(
                                            'TOCHeading2',
                                            parent=sample_style_sheet['Heading2'],
                                            fontSize=10,
                                            leftIndent=40,
                                            firstLineIndent=-20,
                                            spaceBefore=0,
                                            leading=12
                                        )

        self.heading1 = sample_style_sheet['Heading1']
        self.heading2 = sample_style_sheet['Heading2']

        self.tmpDir = tempfile.mkdtemp()
        self.lowering_uid = lowering_uid
        self.lowering_record = getLowering(lowering_uid)
        self.cruise_record = getCruiseByLowering(lowering_uid)

        logging.debug(self.cruise_record)

        self._import_lowering_data()
        self._build_lowering_stats()

        logging.debug(self.lowering_data_headers)


    def __del__(self):

        try:
            shutil.rmtree(self.tmpDir, ignore_errors=True)
        except AttributeError:
            pass


    def _import_lowering_data(self):

        logging.debug("Pulling data Sealog API")
        event_export_data = getEventExportsByLowering(self.lowering_uid, 'csv')

        logging.debug("Importing data into numpy array")
        with tempfile.TemporaryFile(mode='w+') as fp:
           
            print(event_export_data, file=fp)
            fp.seek(0)

            reader = csv.reader(fp, delimiter=',')
            self.lowering_data_headers = next(reader)
            self.lowering_data = np.array(list(reader))

        # Converting ts from string to datetime
        for row in range(len(self.lowering_data)):
            date = datetime.fromisoformat(self.lowering_data[row][self.lowering_data_headers.index( 'ts' )][:-1])
            self.lowering_data[[row],[self.lowering_data_headers.index( 'ts' )]] = np.datetime64(date)


    def _build_lowering_stats(self):

        logging.debug('Building lowering stats data')

        self.lowering_milestones = dict(
            start_dt = None,
            off_deck_dt = None,
            descending_dt = None,
            on_bottom_dt = None,
            off_bottom_dt = None,
            floats_on_surface_dt = None,
            stop_dt = None
        )

        self.lowering_stats = dict(
            max_depth = None,
            bounding_box = None,
            total_duration = None,
            descent_duration = None,
            on_bottom_duration = None,
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

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and 'lowering_off_deck' in self.lowering_record['lowering_additional_meta']['milestones']:
            try:
                self.lowering_milestones['off_deck_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_off_deck'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and 'lowering_descending' in self.lowering_record['lowering_additional_meta']['milestones']:
            try:
                self.lowering_milestones['descending_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_descending'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and 'lowering_on_bottom' in self.lowering_record['lowering_additional_meta']['milestones']:
            try:
                self.lowering_milestones['on_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_on_bottom'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and 'lowering_off_bottom' in self.lowering_record['lowering_additional_meta']['milestones']:
            try:
                self.lowering_milestones['off_bottom_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_off_bottom'][:-1])
            except:
                pass

        if 'milestones' in self.lowering_record['lowering_additional_meta'] and 'lowering_floats_on_surface' in self.lowering_record['lowering_additional_meta']['milestones']:
            try:
                self.lowering_milestones['floats_on_surface_dt'] = datetime.fromisoformat(self.lowering_record['lowering_additional_meta']['milestones']['lowering_floats_on_surface'][:-1])
            except:
                pass

        if 'stats' in self.lowering_record['lowering_additional_meta'] and 'max_depth' in self.lowering_record['lowering_additional_meta']['stats']:
            try:
                self.lowering_stats['max_depth'] = float(self.lowering_record['lowering_additional_meta']['stats']['max_depth'])
            except:
                pass

        if 'stats' in self.lowering_record['lowering_additional_meta'] and 'bounding_box' in self.lowering_record['lowering_additional_meta']['stats']:
            try:
                self.lowering_stats['bounding_box'] = [float(elem) for elem in self.lowering_record['lowering_additional_meta']['stats']['bounding_box']]
            except:
                pass

        # total_duration
        if self.lowering_milestones['start_dt'] and self.lowering_milestones['stop_dt']:
            self.lowering_stats['total_duration'] = self.lowering_milestones['stop_dt'] - self.lowering_milestones['start_dt']
           
        # descent_duration
        if self.lowering_milestones['descending_dt'] and self.lowering_milestones['on_bottom_dt']:
            self.lowering_stats['descent_duration'] = self.lowering_milestones['on_bottom_dt'] - self.lowering_milestones['descending_dt']

        # on_bottom_duration
        if self.lowering_milestones['on_bottom_dt'] and self.lowering_milestones['off_bottom_dt']:
            self.lowering_stats['on_bottom_duration'] = self.lowering_milestones['off_bottom_dt'] - self.lowering_milestones['on_bottom_dt']

        # ascent_duration
        if self.lowering_milestones['off_bottom_dt'] and self.lowering_milestones['floats_on_surface_dt']:
            self.lowering_stats['ascent_duration'] = self.lowering_milestones['floats_on_surface_dt'] - self.lowering_milestones['off_bottom_dt']

        # samples
        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")
        self.lowering_stats['samples_collected'] = len(self.lowering_data[idx,:])


    def _build_stat_table(self):

        logging.debug('Building lowering stats table')

        stat_data = [
            [Paragraph('''<b>Start of Dive:</b>''',self.tableText), self.lowering_milestones['start_dt'].strftime('%Y-%m-%d %H:%M:%S'), Paragraph('''<b>Total Duration:</b>''',self.tableText), _strfdelta(self.lowering_stats['total_duration'])],
            [Paragraph('''<b>On Bottom /<br/>@ Target Depth:</b>''',self.tableText) , self.lowering_milestones['on_bottom_dt'].strftime('%Y-%m-%d %H:%M:%S') if self.lowering_milestones['on_bottom_dt'] else '', Paragraph('''<b>Decent Duration:</b>''',self.tableText), _strfdelta(self.lowering_stats['descent_duration'])],
            [Paragraph('''<b>Off Bottom:</b>''',self.tableText), self.lowering_milestones['off_bottom_dt'].strftime('%Y-%m-%d %H:%M:%S') if self.lowering_milestones['off_bottom_dt'] else '', Paragraph('''<b>On bottom /<br/>@ Target Depth Duration:</b>''',self.tableText), _strfdelta(self.lowering_stats['on_bottom_duration'])],
            [Paragraph('''<b>End of Dive:</b>''',self.tableText), self.lowering_milestones['stop_dt'].strftime('%Y-%m-%d %H:%M:%S'), Paragraph('''<b>Ascent Duration:</b>''',self.tableText), _strfdelta(self.lowering_stats['ascent_duration'])],
            [Paragraph('''<b>Max Depth:</b>''',self.tableText), str(self.lowering_stats['max_depth']) + ' meters' if self.lowering_stats['max_depth'] else '', Paragraph('''<b>Samples Collected:</b>''',self.tableText), str(self.lowering_stats['samples_collected']) if self.lowering_stats['samples_collected'] else '0'],
            [Paragraph('''<b>Bounding Box:</b>''',self.tableText), ', '.join([str(pos) for pos in self.lowering_stats['bounding_box']]) if self.lowering_stats['bounding_box'] else '']
        ]

        stat_table = Table(stat_data, style=[
                                                ('BOX',(0,0),(-1,-1),1,colors.black),
                                                ('LINEAFTER',(1,0),(1,4),1,colors.black),
                                                ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                                ('FONTSIZE',(0,0),(-1,-1),8),
                                                ('SPAN',(1,-1),(-1,-1)),
                                                ('VALIGN',(0,0),(-1,-1),'TOP'),
                                                ('NOSPLIT',(0,0),(-1,-1))
                                            ])

        stat_table._argW[0]=2.8 * cm
        stat_table._argW[1]=3 * cm
        stat_table._argW[2]=4 * cm
        stat_table._argW[3]=2.5 * cm

        return stat_table


    def _build_summary_table(self):

        logging.debug('Building lowering summary table')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "VEHICLE")

        vehicle_data = self.lowering_data[idx,:]

        svg2imgFile = svg2rlg('./assets/images/dive_information_diagram.svg')
        dive_stage_image = Image(svg2imgFile)

        dive_stage_image._restrictSize(PAGE_WIDTH/2, 20 * cm)
        dive_stage_image.hAlign = 'CENTER'

        start_of_dive = self.lowering_milestones['start_dt']
        off_deck = self.lowering_milestones['off_deck_dt']
        first_float_on = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'First float on', vehicle_data)])), None)
        last_float_on = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float on', vehicle_data)])), None)
        float_num = None
        if 'event_option.number_of_floats?' in self.lowering_data_headers:
            float_num = next(reversed(list([event[self.lowering_data_headers.index( 'event_option.number_of_floats?' )] for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float on', vehicle_data)])), None)
        descending = self.lowering_milestones['descending_dt']
        on_bottom = self.lowering_milestones['on_bottom_dt']
        off_bottom = self.lowering_milestones['off_bottom_dt']
        floats_on_surface = self.lowering_milestones['floats_on_surface_dt']
        first_float_off = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'First float off', vehicle_data)])), None)
        last_float_off = next(reversed(list([event[self.lowering_data_headers.index( 'ts' )].astype(datetime) for event in filter(lambda event: event[self.lowering_data_headers.index( 'event_option.milestone' )] == 'Last float off', vehicle_data)])), None)
        on_deck = self.lowering_milestones['stop_dt']

        # Deployment Duration (off_deck --> last_float_added)
        deployment_duration = None
        if off_deck and descending:
            deployment_duration = descending - off_deck

        # Descent Duration (descending --> on_bottom)
        descent_duration = None
        if descending and on_bottom:
            descent_duration = on_bottom - descending

        # On bottom/@ target depth Duration (on_bottom --> off_bottom)
        on_bottom_duration = None
        if on_bottom and off_bottom:
            on_bottom_duration = off_bottom - on_bottom

        # Ascent Duration (off_bottom --> floats_on_surface)
        ascent_duration = None
        if off_bottom and floats_on_surface:
            ascent_duration = floats_on_surface - off_bottom

        # Recovery Duration (first_float_off --> vehicle_secured)
        recovery_duration = None
        if floats_on_surface and on_deck:
            recovery_duration = on_deck - floats_on_surface

        # Deck-to-deck (off_deck --> on_deck)
        deck_to_deck_duration = None
        if off_deck and on_deck:
            deck_to_deck_duration = on_deck - off_deck

        summary_data = [
            [dive_stage_image],
            ['Stage', 'Date/Time', 'Stage Duration', 'Total'],
            ['Off-Deck', off_deck.strftime('%Y-%m-%d %H:%M:%S') if off_deck else '', Paragraph('<b>Deployment:</b><br/>' + _strfdelta(deployment_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.tableTextCentered) if deployment_duration else Paragraph('<b>Deployment</b><br/>n/a', self.tableTextCentered) , Paragraph('<b>Deck-to-deck:</b><br/>' + _strfdelta(deck_to_deck_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.summaryTableD2DText) if deck_to_deck_duration else Paragraph('<b>Deck-to-deck:</b><br/>n/a', self.SummaryD2DTableText)],
            ['First Float On', datetime.fromisoformat(first_float_on).strftime('%Y-%m-%d %H:%M:%S') if first_float_on else ''],
            ['Last Float On', datetime.fromisoformat(last_float_on).strftime('%Y-%m-%d %H:%M:%S') if last_float_on else ''],
            ['', '', Paragraph('<b>Descent: </b>' + _strfdelta(descent_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.tableText) if descent_duration else Paragraph('<b>Descent:</b><br/>n/a', self.tableTextCentered)],
            ['On Bottom/@ Depth', on_bottom.strftime('%Y-%m-%d %H:%M:%S') if on_bottom else '', Paragraph('<b>On Bottom/@ Depth:</b><br/>' + _strfdelta(on_bottom_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.tableTextCentered) if on_bottom_duration else Paragraph('<b>On Bottom/@Target Depth:</b><br/>n/a', self.tableTextCentered)],
            ['Off Bottom/@ Depth', off_bottom.strftime('%Y-%m-%d %H:%M:%S') if off_bottom else ''],
            ['', '', Paragraph('<b>Ascent: </b>' + _strfdelta(ascent_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.tableTextCentered) if ascent_duration else Paragraph('<b>Ascent:</b><br/>n/a', self.tableTextCentered)],
            ['Floats on Surface', floats_on_surface.strftime('%Y-%m-%d %H:%M:%S') if floats_on_surface else '', Paragraph('<b>Recovery:</b><br/>' + _strfdelta(recovery_duration, fmt='{D:02}d {H:02}:{M:02}:{S:02}'), self.tableTextCentered) if recovery_duration else Paragraph('<b>Recovery:</b><br/>n/a', self.tableTextCentered)],
            ['First Float Off', datetime.fromisoformat(first_float_off).strftime('%Y-%m-%d %H:%M:%S')],
            ['Last Float Off', datetime.fromisoformat(last_float_off).strftime('%Y-%m-%d %H:%M:%S') if last_float_off else ''],
            ['On-Deck / End', on_deck.strftime('%Y-%m-%d %H:%M:%S') if on_deck else '']
        ]

        summary_table = Table(summary_data, style=[
                                                ('BOX',(0,1),(-1,-1),.5,colors.black),
                                                ('GRID',(0,1),(-1,-1),.5,colors.black),
                                                ('SPAN',(0,0),(-1,0)),
                                                ('SPAN',(2,2),(2,4)),
                                                ('SPAN',(0,5),(1,5)),
                                                ('BACKGROUND', (0, 5), (2, 5), colors.lightgrey),
                                                ('SPAN',(2,6),(2,7)),
                                                ('SPAN',(0,8),(1,8)),
                                                ('BACKGROUND', (0, 8), (2, 8), colors.lightgrey),
                                                ('SPAN',(2,9),(2,-1)),
                                                ('SPAN',(3,2),(3,-1)),
                                                ('FONTSIZE',(0,0),(-1,-1),8),
                                                # ('LEADING',(0,0),(-1,-1),8),
                                                ('ALIGNMENT',(0,0),(-1,-1),'CENTER'),
                                                ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                                                ('BOTTOMPADDING',(0,0),(-1,-1),0),
                                                ('TOPPADDING',(0,0),(-1,-1),2),
                                                ('BACKGROUND', (0, 1), (-1, 1), colors.lightgrey)
                                            ])
        summary_table._argW[0]=3 * cm
        summary_table._argW[1]=3 * cm
        summary_table._argW[2]=3.5 * cm
        summary_table._argW[3]=3.25 * cm

        return summary_table


    def _build_depth_plot(self):

        if 'vehicleRealtimeNavData.depth_value' not in self.lowering_data_headers:
            logging.warning("No sprint depth data captured, can't build dive depth profile.")
            return None

        logging.debug('Building depth plot')

        start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        if not start_ts:
            return None

        fig_depth_plot, ax_depth_plot = plt.subplots(figsize=(7,2.5))

        x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
        y_depth = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.depth_value' )]]]

        ax_depth_plot.plot(x_ts,y_depth)
        ax_depth_plot.invert_yaxis()
        ax_depth_plot.xaxis.set_major_locator(mdates.HourLocator(interval=4))
        ax_depth_plot.set(ylabel='Depth [m]', title='Depth Profile')

        formatter = mdates.DateFormatter("%H:00")
        ax_depth_plot.xaxis.set_major_formatter(formatter)

        # if self.lowering_milestones['on_bottom_dt']:
        #     ax_depth_plot.axvline(x=datetime.utcfromtimestamp((self.lowering_milestones['on_bottom_dt'] - start_ts).total_seconds()),color='black')

        # if self.lowering_milestones['off_bottom_dt']:
        #     ax_depth_plot.axvline(x=datetime.utcfromtimestamp((self.lowering_milestones['off_bottom_dt'] - start_ts).total_seconds()),color='black')

        ax_depth_plot.yaxis.grid(linestyle='--')

        imgdata = BytesIO()

        fig_depth_plot.tight_layout()
        fig_depth_plot.savefig(imgdata, format='svg')
        plt.close(fig_depth_plot)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_depths_plot(self):


        if 'vehicleRealtimeNavData.depth_value' not in self.lowering_data_headers and 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers and 'vehicleRealtimeParoData.depth_value' not in self.lowering_data_headers:
            logging.warning("No depth data captured, can't build depths profile.")
            return None

        logging.debug('Building depths plot')

        start_ts = next((datetime.fromisoformat(ts[0]) for ts in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime) if ts is not None), None)

        fig_depths_plot, ax_depths_plot = plt.subplots()

        ax_depths_plot.set_title(label='Depth Sensor Comparison Data', pad=25)

        error_row=0
        x_ts = [ datetime.utcfromtimestamp((datetime.fromisoformat(tsStr[0]) - start_ts).total_seconds()) for tsStr in self.lowering_data[:,[self.lowering_data_headers.index( 'ts' )]].astype(datetime)]
        ax_depths_plot.set(ylabel='Depth [m]')

        ax_depths_plot.invert_yaxis()
        ax_depths_plot.yaxis.grid(linestyle='--')
        ax_depths_plot.xaxis.set_major_locator(mdates.HourLocator(interval=4))
        formatter = mdates.DateFormatter("%H:00")
        ax_depths_plot.xaxis.set_major_formatter(formatter)


        if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers:
            y_depth_sprint = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_sprint,label='Sprint')

        if 'vehicleRealtimeCTDData.depth_value' in self.lowering_data_headers:
            y_depth_CTD = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_CTD,label='CTD')

        if 'vehicleRealtimeParoData.depth_value' in self.lowering_data_headers:
            y_depth_paro = [ float(depthStr[0]) if depthStr[0] else None for depthStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeParoData.depth_value' )]]]
            ax_depths_plot.plot(x_ts,y_depth_paro,label='Paro')

        ax_depths_plot.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_depths_plot.tight_layout()
        fig_depths_plot.savefig(imgdata, format='svg')
        plt.close(fig_depths_plot)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_dive_track(self):

        if 'vehicleRealtimeNavData.longitude_value' not in self.lowering_data_headers:
            logging.warning("No navigational data captured, can't build dive track.")
            return None

        if not self.lowering_stats['bounding_box']:
            logging.warning("No bounding box defined, can't build dive track.")
            return None

        logging.debug('Building dive track')

        fig_dive_track, ax_dive_track = plt.subplots()

        ax_dive_track.set(title='Dive Track')

        m = Basemap(llcrnrlat=math.floor(self.lowering_stats['bounding_box'][2] * 100)/100.0,llcrnrlon=math.floor(self.lowering_stats['bounding_box'][3] * 100)/100.0,urcrnrlat=math.ceil(self.lowering_stats['bounding_box'][0] * 100)/100.0,urcrnrlon=math.ceil(self.lowering_stats['bounding_box'][1] * 100)/100.0,
            projection='merc',resolution ='l',area_thresh=1000.)

        lons = np.array([ float(lonStr[0]) if lonStr[0] else None for lonStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.longitude_value' )]]])
        lons = lons[lons != np.array(None)]

        lats = np.array([ float(latStr[0]) if latStr[0] else None for latStr in self.lowering_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeNavData.latitude_value' )]]])
        lats = lats[lats != np.array(None)]

        x,y = m(lons, lats)
        ax_dive_track.plot(x,y,linewidth=1,color='r')

        ax_dive_track.plot(x[0], y[0], linestyle='none', marker="o", markersize=12, alpha=0.6, c="green", markeredgecolor="black", markeredgewidth=1)
        ax_dive_track.annotate('Start', (x[0],y[0]))

        ax_dive_track.plot(x[-1], y[-1], linestyle='none', marker="o", markersize=12, alpha=0.6, c="red", markeredgecolor="black", markeredgewidth=1)
        ax_dive_track.annotate('End', (x[-1],y[-1]))

        ax_dive_track.set(title='Dive Track')

        # draw coastlines, meridians and parallels.
        m.drawcoastlines()
        m.drawcountries()
        m.drawmapboundary(fill_color='#99ffff')
        m.fillcontinents(color='#cc9966',lake_color='#99ffff')
        m.drawparallels(np.arange(-60,60,.01),labels=[1,1,0,0])
        m.drawmeridians(np.arange(-180,180,.01),labels=[0,0,0,1])

        imgdata = BytesIO()

        fig_dive_track.tight_layout()
        fig_dive_track.savefig(imgdata, format='svg')
        plt.close(fig_dive_track)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_downcast_sv_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build SV profile.")
            return None

        if not self.lowering_milestones['on_bottom_dt']:
            logging.warning("No On Bottom milestone captured, can't build SV profile.")
            return None

        logging.debug('Building downcast SV data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['on_bottom_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_sv_downcast, ax_sv_downcast_1 = plt.subplots()

        ax_sv_downcast_1.invert_yaxis()
        ax_sv_downcast_1.set(ylabel='Depth [m]', title='SV Downcast Data')
        ax_sv_downcast_1.grid(linestyle='--')

        sv = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sv_value' )]]]
        cond = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.cond_value' )]]]
        temp = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.temp_value' )]]]
        sal = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sal_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        SV, = ax_sv_downcast_1.plot(sv,depth, label='SV', color='blue')
        ax_sv_downcast_1.set_xlabel('Sound Velocity [m/s]')
        ax_sv_downcast_1.legend(handles=[SV], loc='center right')

        imgdata = BytesIO()

        fig_sv_downcast.tight_layout()
        fig_sv_downcast.savefig(imgdata, format='svg')
        plt.close(fig_sv_downcast)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_upcast_sv_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build SV profile.")
            return None

        if not self.lowering_milestones['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build SV profile.")
            return None

        logging.debug('Building upcast SV data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['stop_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_sv_upcast, ax_sv_upcast_1 = plt.subplots()

        ax_sv_upcast_1.invert_yaxis()
        ax_sv_upcast_1.set(ylabel='Depth [m]', title='SV Upcast Data')
        ax_sv_upcast_1.grid(linestyle='--')

        sv = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sv_value' )]]]
        cond = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.cond_value' )]]]
        temp = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.temp_value' )]]]
        sal = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.sal_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        SV, = ax_sv_upcast_1.plot(sv,depth, label='SV', color='blue')
        ax_sv_upcast_1.set_xlabel('Sound Velocity [m/s]')
        ax_sv_upcast_1.legend(handles=[SV], loc='center right')

        imgdata = BytesIO()

        fig_sv_upcast.tight_layout()
        fig_sv_upcast.savefig(imgdata, format='svg')
        plt.close(fig_sv_upcast)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_downcast_ctd_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build CTD profile.")
            return None

        if not self.lowering_milestones['on_bottom_dt']:
            logging.warning("No On Bottom milestone captured, can't build CTD profile.")
            return None

        logging.debug('Building downcast CTD data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['on_bottom_dt']))

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

        Salinity, = ax_ctd_downcast_1.plot(sal,depth, label='Salinity', color='blue', )
        ax_ctd_downcast_1.set_xlabel(xlabel='Salinity [ppt]')
        ax_ctd_downcast_1.xaxis.label.set_color('blue')
        ax_ctd_downcast_1.tick_params(axis='x', colors='blue')

        Conductivity, = ax_ctd_downcast_2.plot(cond,depth, label='Conductivity', color='orangered')
        ax_ctd_downcast_2.xaxis.set_ticks_position('bottom')
        ax_ctd_downcast_2.xaxis.set_label_position('bottom')
        ax_ctd_downcast_2.xaxis.label.set_color('orangered')
        ax_ctd_downcast_2.spines['bottom'].set_position(('outward', 36))
        ax_ctd_downcast_2.tick_params(axis='x', colors='orangered')
        ax_ctd_downcast_2.set_xlabel('Conductivity [S/m]')

        Temperature, = ax_ctd_downcast_3.plot(temp,depth, label='Temperature', color='green')
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

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_upcast_ctd_data(self):

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD data captured, can't build CTD profile.")
            return None

        if not self.lowering_milestones['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build CTD profile.")
            return None

        logging.debug('Building upcast CTD data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['stop_dt']))

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

        Salinity, = ax_ctd_upcast_1.plot(sal,depth, label='Salinity', color='blue', )
        ax_ctd_upcast_1.set_xlabel(xlabel='Salinity [ppt]')
        ax_ctd_upcast_1.xaxis.label.set_color('blue')
        ax_ctd_upcast_1.tick_params(axis='x', colors='blue')

        Conductivity, = ax_ctd_upcast_2.plot(cond,depth, label='Conductivity', color='orangered')
        ax_ctd_upcast_2.xaxis.set_ticks_position('bottom')
        ax_ctd_upcast_2.xaxis.set_label_position('bottom')
        ax_ctd_upcast_2.xaxis.label.set_color('orangered')
        ax_ctd_upcast_2.spines['bottom'].set_position(('outward', 36))
        ax_ctd_upcast_2.tick_params(axis='x', colors='orangered')
        ax_ctd_upcast_2.set_xlabel('Conductivity [S/m]')

        Temperature, = ax_ctd_upcast_3.plot(temp,depth, label='Temperature', color='green')
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

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_downcast_o2_data(self):

        if 'vehicleRealtimeO2Data.abs_value_value' not in self.lowering_data_headers:
            logging.warning("No O2 data captured, can't build O2 profile.")
            return None

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD depth data captured, can't build O2 profile.")
            return None

        if not self.lowering_milestones['on_bottom_dt']:
            logging.warning("No On Bottom milestone captured, can't build O2 profile.")
            return None

        logging.debug('Building downcast O2 data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['start_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['on_bottom_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_o2_downcast, ax_o2_downcast_1 = plt.subplots()

        ax_o2_downcast_1.invert_yaxis()
        ax_o2_downcast_1.set(xlabel="m/s", ylabel='Depth [m]', title='O2 Downcast Data')
        ax_o2_downcast_1.grid(linestyle='--')

        o2 = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeO2Data.abs_value_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        O2, = ax_o2_downcast_1.plot(o2,depth, label='O2', color='blue')
        ax_o2_downcast_1.set_xlabel('Oxygen [\u03BCM]')

        imgdata = BytesIO()

        fig_o2_downcast.tight_layout()
        fig_o2_downcast.savefig(imgdata, format='svg')
        plt.close(fig_o2_downcast)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_upcast_o2_data(self):

        if 'vehicleRealtimeO2Data.abs_value_value' not in self.lowering_data_headers:
            logging.warning("No O2 data captured, can't build O2 profile.")
            return None

        if 'vehicleRealtimeCTDData.depth_value' not in self.lowering_data_headers:
            logging.warning("No CTD depth data captured, can't build O2 profile.")
            return None

        if not self.lowering_milestones['off_bottom_dt']:
            logging.warning("No Off Bottom milestone captured, can't build O2 profile.")
            return None

        logging.debug('Building upcast O2 data')

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') >= np.datetime64(self.lowering_milestones['off_bottom_dt'])) & (self.lowering_data[:,self.lowering_data_headers.index( 'ts' )].astype('datetime64') < np.datetime64(self.lowering_milestones['stop_dt']))

        cast_data = self.lowering_data[idx,:]

        fig_o2_upcast, ax_o2_upcast_1 = plt.subplots()

        ax_o2_upcast_1.invert_yaxis()
        ax_o2_upcast_1.set(xlabel="m/s", ylabel='Depth [m]', title='O2 Upcast Data')
        ax_o2_upcast_1.grid(linestyle='--')

        o2 = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeO2Data.abs_value_value' )]]]
        depth = [ float(data[0]) if data[0] else None for data in cast_data[:,[self.lowering_data_headers.index( 'vehicleRealtimeCTDData.depth_value' )]]]

        O2, = ax_o2_upcast_1.plot(o2,depth, label='O2', color='blue')
        ax_o2_upcast_1.set_xlabel('Oxygen [\u03BCM]')

        imgdata = BytesIO()

        fig_o2_upcast.tight_layout()
        fig_o2_upcast.savefig(imgdata, format='svg')
        plt.close(fig_o2_upcast)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_sample_tables_with_previews(self):

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")

        sample_data = self.lowering_data[idx,:]

        if len(sample_data) == 0:
            logging.warning("No SAMPLE events captured, can't build sample tables.")
            return list()

        logging.debug('Building lowering sample tables with previews')

        sample_tables = list()

        for row in range(len(sample_data)):

            if 'vehicleRealtimeFramegrabberData.filename_value' not in self.lowering_data_headers or not sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')]:
                logging.warning('No framegrabber data for SAMPLE event.')
                I = "NO IMAGE AVAILABLE"

            else:
                fd, thumbnail = tempfile.mkstemp(suffix=".jpg", dir=self.tmpDir)
                try:
                    # print(thumbnail)
                    _resize_image(os.path.join(apiServerFilePath,'images',sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')]),thumbnail,(960,540))

                    I = Image(thumbnail)
                    I.drawHeight = 7.6 * cm * I.drawHeight / I.drawWidth
                    I.drawWidth = 7.6 * cm
                except:
                    logging.warning("Image file for SAMPLE event not found: " + os.path.join(apiServerFilePath,'images',sample_data[row,self.lowering_data_headers.index('vehicleRealtimeFramegrabberData.filename_value')]))
                    I = "IMAGE FILE NOT FOUND!"
                    pass

            text_comment = Paragraph(sample_data[row,self.lowering_data_headers.index('event_free_text')] + '<br/>' + sample_data[row,self.lowering_data_headers.index('event_option.event_comment')], self.tableText) if sample_data[row,self.lowering_data_headers.index('event_free_text')] != '' else Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.event_comment')],self.tableText)

            sample_table_data = [
                [
                    sample_data[row,self.lowering_data_headers.index('event_option.id')],
                    'Location: ' + sample_data[row,self.lowering_data_headers.index('event_option.storage_location')]
                ],            
                [
                    'Text & Comment',
                    'Image'
                ],
                [
                    text_comment,
                    I
                ],
            ]

            sample_table = Table(sample_table_data, rowHeights=[24,16,120], style=[
                                                            ('BOX',(0,0),(-1,-1),1,colors.black),
                                                            ('GRID',(0,0),(-1,-1),1,colors.black),
                                                            ('FONTNAME', (0,0),(0,0), 'Helvetica-Bold'),
                                                            ('ALIGN',(1,0),(1,0), 'RIGHT'),
                                                            ('ALIGN',(1,2),(1,2), 'CENTER'),
                                                            ('VALIGN',(0,1),(-1,-1), 'MIDDLE'),
                                                            ('VALIGN',(0,2),(0,2), 'TOP'),
                                                            ('NOSPLIT', (0, 0), (-1, -1)),
                                                            ('BACKGROUND', (0,1),(-1,1), colors.lightgrey)
                                                          ])
            sample_table._argW[1]=7.6 * cm

            sample_tables.append(sample_table)

        return sample_tables


    def _build_sample_table(self):

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "SAMPLE")

        sample_data = self.lowering_data[idx,:]

        if len(sample_data) == 0:
            logging.warning("No SAMPLE events captured, can't build sample table.")
            return None

        logging.debug('Building lowering sample table')

        sample_table_data = [
            ['SampleID:', 'Date/Time:', 'Location:', 'Type:', 'Lat:', 'Lon:', 'Depth:', 'Alt:', 'CTD_C:', 'CTD_T:', 'CTD_Sal:', 'O2_abs:', 'Text:', 'Comment:']
        ]

        for row in range(len(sample_data)):
            sample_table_data.append(
                [
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.id')], self.sampleTableText),
                    datetime.fromisoformat(sample_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.storage_location')], self.sampleTableText),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.type')], self.sampleTableText),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.latitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.longitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.altitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_value')] + ' ' + sample_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_uom')], self.sampleTableText) if 'vehicleRealtimeO2Data.abs_value_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_free_text')], self.sampleTableText),
                    Paragraph(sample_data[row,self.lowering_data_headers.index('event_option.event_comment')], self.sampleTableText) if 'event_option.event_comment' in self.lowering_data_headers else ''
                ]
            )

        sample_table = Table(sample_table_data, style=[
                                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                                        ('GRID',(0,0),(-1,-1),1,colors.black),
                                                        ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                                        ('FONTSIZE',(0,0),(-1,-1),5),
                                                        ('LEADING',(0,0),(-1,-1),5),
                                                        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey)
                                                      ])

        return sample_table


    def _build_free_form_table(self):

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "FREE_FORM")

        free_form_data = self.lowering_data[idx,:]

        if len(free_form_data) == 0:
            logging.warning("No FREE_FORM events captured, can't build FREE_FORM tables.")
            return list()

        logging.debug('Building lowering free_form events tables')

        free_form_table_data = [
            ['Date/Time:', 'Author', 'Lat:', 'Lon:', 'Depth:', 'Alt:', 'CTD_C:', 'CTD_T:', 'CTD_Sal:', 'O2_abs:', 'Text:', 'Comment:']
        ]

        for row in range(len(free_form_data)):
            free_form_table_data.append(
                [
                    datetime.fromisoformat(free_form_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S'),
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('event_author')], self.sampleTableText),
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.latitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.longitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.altitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_value')] + ' ' + free_form_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_uom')], self.sampleTableText) if 'vehicleRealtimeO2Data.abs_value_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('event_free_text')], self.sampleTableText),
                    Paragraph(free_form_data[row,self.lowering_data_headers.index('event_option.event_comment')], self.sampleTableText) if 'event_option.event_comment' in self.lowering_data_headers else ''
                ]
            )

        free_form_table = Table(free_form_table_data, style=[
                                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                                        ('GRID',(0,0),(-1,-1),1,colors.black),
                                                        ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                                        ('FONTSIZE',(0,0),(-1,-1),5),
                                                        ('LEADING',(0,0),(-1,-1),5),
                                                        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey)
                                                      ])

        return free_form_table


    def _build_event_breakdown_table(self):
        logging.debug('Building event breakdown table')

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

        event_breakdown_table_data.append([
            'Total:',
            frequencies[:,1].astype('int').sum(),
            '100.0'
        ])



        event_breakdown_table = Table(event_breakdown_table_data, style=[
                                                                            ('BOX',(0,0),(-1,-1),1,colors.black),
                                                                            ('LINEAFTER',(0,0),(-1,-1),1,colors.black),
                                                                            ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                                                            ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
                                                                            ('NOSPLIT', (0, 0), (-1, -1))
                                                                        ])

        event_breakdown_table._argW[0]=5 * cm
        event_breakdown_table._argW[1]=1.9 * cm
        event_breakdown_table._argW[2]=1.9 * cm

        return event_breakdown_table


    def _build_non_system_events_tables(self):

        event_templates = getEventTemplates()
        event_template_values = [ template['event_value'] for template in filter(lambda event_template: not event_template['system_template'], event_templates)]
        event_template_values.sort()

        # event_exclude_list = list('FREE_FORM', 'ASNAP')
        event_value_tables_tables = list()

        logging.debug('Building lowering event_value events tables')

        #for each event template
        for event_template_value in event_template_values:

            template = next((template for template in filter(lambda event_template: event_template['event_value'] == event_template_value, event_templates)), None)
            event_option_headers = ([option['event_option_name'] for option in template['event_options']])

            idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == event_template_value)

            event_value_data = self.lowering_data[idx,:]

            if len(event_value_data) == 0:
                logging.warning("No " + event_template_value + " events captured, can't build " + event_template_value + " tables.")
                event_value_tables_tables.append(list())
                continue

            table_header = ['Date/time', 'Author']
            table_header += event_option_headers
            table_header += ['Lat:', 'Lon:', 'Depth:', 'Alt:', 'CTD_C:', 'CTD_T:', 'CTD_Sal:', 'O2_abs:', 'Text:', 'Comment:']

            event_value_table_data = list()
            event_value_table_data.append(table_header)

            # for each row of event template data
            for row in range(len(event_value_data)):

                event_value_table_row = list()
                ts = datetime.fromisoformat(event_value_data[row,self.lowering_data_headers.index('ts')]).strftime('%Y-%m-%d\n%H:%M:%S')
                event_value_table_row += [
                    ts,
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('event_author')], self.sampleTableText),
                ]

                if len(event_option_headers) > 0:
                    for option in range(len(event_option_headers)):
                        event_value_table_row += [Paragraph(event_value_data[row,self.lowering_data_headers.index('event_option.' + event_option_headers[option].lower().replace(' ', '_'))], self.sampleTableText)]

                event_value_table_row += [
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.latitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.latitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.longitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.longitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.depth_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.depth_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeNavData.altitude_uom')], self.sampleTableText) if 'vehicleRealtimeNavData.altitude_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.cond_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.cond_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.temp_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.temp_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeCTDData.sal_uom')], self.sampleTableText) if 'vehicleRealtimeCTDData.sal_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_value')] + ' ' + event_value_data[row,self.lowering_data_headers.index('vehicleRealtimeO2Data.abs_value_uom')], self.sampleTableText) if 'vehicleRealtimeO2Data.abs_value_value' in self.lowering_data_headers else 'No Data',
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('event_free_text')], self.sampleTableText),
                    Paragraph(event_value_data[row,self.lowering_data_headers.index('event_option.event_comment')], self.sampleTableText) if 'event_option.event_comment' in self.lowering_data_headers else ''
                ]

                event_value_table_data.append(event_value_table_row)

            event_value_table = Table(event_value_table_data, style=[
                                                                        ('BOX',(0,0),(-1,-1),1,colors.black),
                                                                        ('GRID',(0,0),(-1,-1),1,colors.black),
                                                                        ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                                                        ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                                                        ('FONTSIZE',(0,0),(-1,-1),6),
                                                                        ('LEADING',(0,0),(-1,-1),8),
                                                                        ('BOTTOMPADDING',(0,0),(-1,-1),0),
                                                                        ('TOPPADDING',(0,0),(-1,-1),2),
                                                                    ])

            event_value_tables_tables.append(event_value_table)

        return event_value_tables_tables, event_template_values


    def _build_watch_change_table(self):

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]

        if len(watch_change_data) == 0:
            logging.warning("No WATCH CHANGE events captured, can't build watch change table.")
            return None

        logging.debug('Building watch_change tables')

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
                                                                    ('BACKGROUND', (0,0),(-1,0), colors.lightgrey),
                                                                    ('NOSPLIT', (0, 0), (-1, -1))
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

        col_names = list(['id','ts','event_option.co-pilot','event_option.datalogger','event_option.pilot',])
        cols = np.array([header_name in col_names for header_name in self.lowering_data_headers])

        operators = watch_change_data[:, self.lowering_data_headers.index('event_option.pilot')]
        operators = np.append(operators, watch_change_data[:, self.lowering_data_headers.index('event_option.co-pilot')])
        operators = np.append(operators, watch_change_data[:, self.lowering_data_headers.index('event_option.datalogger')])

        operators = operators[operators != np.array('')]
        operators = np.unique(operators)

        operators = np.reshape(operators, (-1, 1))
        seconds = np.zeros((len(operators),3))

        manhours = pd.DataFrame(data=watch_change_data[0:,cols], # values
            index=watch_change_data[0:,0],                       # 1st column as index
            columns=col_names)                                   # column names

        manhours['ts'] = pd.to_datetime(manhours['ts'], infer_datetime_format=True) # transfrom string to datetime
        manhours['time_diff'] = 0

        for i in range(manhours.shape[0]-1):
            manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

        manhours['time_diff'][-1] = (self.lowering_milestones['stop_dt'] - manhours['ts'][-1]).total_seconds()

        for row in range(len(seconds)):

            seconds[row,0] = manhours.loc[manhours['event_option.pilot'] == operators[row,0], 'time_diff'].sum()
            seconds[row,1] = manhours.loc[manhours['event_option.co-pilot'] == operators[row,0], 'time_diff'].sum()
            seconds[row,2] = manhours.loc[manhours['event_option.datalogger'] == operators[row,0], 'time_diff'].sum()

        fig_watch_change, ax_watch_change = plt.subplots(figsize=(7,4.5))
        ax_watch_change.set_title(label='Operator Working Hours', pad=25)

        pilots = ax_watch_change.bar(operators[:,0],seconds[:,0], label='Pilot')
        co_pilots = ax_watch_change.bar(operators[:,0],seconds[:,1], label='Co-Pilot', bottom=seconds[:,0])
        dataloggers = ax_watch_change.bar(operators[:,0],seconds[:,2], label='Datalogger', bottom=seconds[:,1])

        ax_watch_change.yaxis.set_major_locator(ticker.MultipleLocator(60*60))
        ax_watch_change.yaxis.set_minor_locator(ticker.MultipleLocator(60*15))
        ax_watch_change.yaxis.set_major_formatter(ticker.FuncFormatter(_seconds_to_hours_formatter))
        ax_watch_change.yaxis.grid(linestyle='--')

        ax_watch_change.set(ylabel='Hours')
        ax_watch_change.legend(loc='lower left', bbox_to_anchor= (0.0, 1.01), ncol=3, borderaxespad=0, frameon=False, prop={"size":8})

        imgdata = BytesIO()

        fig_watch_change.tight_layout()
        fig_watch_change.savefig(imgdata, format='svg')
        plt.close(fig_watch_change)
        imgdata.seek(0)

        svg2imgFile = svg2rlg(imgdata)

        return svg2imgFile


    def _build_watch_change_summary_table(self):

        idx = (self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "WATCH CHANGE")

        watch_change_data = self.lowering_data[idx,:]
       
        if len(watch_change_data) == 0:
            logging.warning("No WATCH CHANGE events captured, can't build watch sumary table.")
            return None

        logging.debug('Building watch_change summary table')

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

        operator_hours = np.column_stack((operators, np.zeros((len(operators),4))))

        manhours = pd.DataFrame(data=watch_change_data[0:,cols],  # values
                                index=watch_change_data[0:,0],    # 1st column as index
                                columns=col_names)                # column names

        manhours['ts'] = pd.to_datetime(manhours['ts'], infer_datetime_format=True) # transfrom string to datetime
        manhours['time_diff'] = 0

        for i in range(manhours.shape[0]-1):
            manhours['time_diff'][i] = (manhours['ts'][i+1] - manhours['ts'][i]).total_seconds()

        manhours['time_diff'][-1] = (self.lowering_milestones['stop_dt'] - manhours['ts'][-1]).total_seconds()

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
            operator_hours[row,4] = np.sum(operator_hours[row,1:4].astype('int'))

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

        # +-----------------------------+-----------------------+
        # | Timestamp:                  | Type:                 |
        # +-----------------------------+-----------------------+
        # | Text:                                               |
        # +-----------------------------------------------------+
        # | Comment:                                            |
        # +-----------------------------------------------------+

        idx=(self.lowering_data[:,self.lowering_data_headers.index( 'event_value' )] == "PROBLEM")

        problem_data = self.lowering_data[idx,:]

        if len(problem_data) == 0:
            logging.warning("No PROBLEM events captured, can't build problem table.")
            return list()

        logging.debug('Building problem tables')

        problem_tables = list()

        for row in range(len(problem_data)):

            problem_table_data = [
                [Paragraph('''<b>Type:</b>''',self.eventTableText), problem_data[row,self.lowering_data_headers.index('event_option.type')],Paragraph('''<b>Date/Time:</b>''',self.eventTableText), problem_data[row,self.lowering_data_headers.index('ts')].astype('datetime64[s]')],
                [Paragraph('''<b>Text:</b>''',self.eventTableText), problem_data[row,self.lowering_data_headers.index('event_free_text')], ''],
                [Paragraph('''<b>Comment:</b>''',self.eventTableText), problem_data[row,self.lowering_data_headers.index('event_option.event_comment')] if 'event_option.event_comment' in self.lowering_data_headers else '', '']
            ]

            problem_table = Table(problem_table_data, style=[
                                    ('BOX',(0,0),(-1,-1),1,colors.black),
                                    ('LINEAFTER',(1,0),(1,0),1,colors.black),
                                    ('LINEBELOW',(0,0),(-1,-1),1,colors.black),
                                    ('VALIGN',(0,0),(-1,-1), 'TOP'),
                                    ('SPAN',(1,1),(-1,1)),
                                    ('SPAN',(1,2),(-1,2)),
                                    ('NOSPLIT', (0, 0), (-1, -1)),
                                    ('LEADING',(0,0),(-1,-1),8),
                                    ('BOTTOMPADDING',(0,0),(-1,-1),0),
                                    ('TOPPADDING',(0,0),(-1,-1),2),
                                 ])

            problem_table._argW[0]=2.4 * cm
            problem_table._argW[1]=4 * cm
            problem_table._argW[2]=2.4 * cm
            problem_table._argW[3]=4 * cm

            problem_tables.append(problem_table)

        return problem_tables


    def build_pdf(self):
        pass
