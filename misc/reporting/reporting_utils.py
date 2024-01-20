#!/usr/bin/env python3
'''
FILE:           reporting_utils.py

DESCRIPTION:    This file contains common functions used in multiple reporting-
                related scripts.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-05-03
REVISION:

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

from string import Formatter
from PIL import Image as pil_Image

def seconds_to_hours_formatter(seconds, pos=None):
    """
    Convert seconds to hh:mm
    """
    return '%d:00' % (seconds//3600)


def strfdelta(t_delta, fmt='{D:02}d {H:02}h {M:02}m {S:02}s', input_type='timedelta'):
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

    The input_type argument allows t_delta to be a regular number instead of the
    default, which is a datetime.timedelta object.  Valid input_type strings:
        's', 'seconds',
        'm', 'minutes',
        'h', 'hours',
        'd', 'days',
        'w', 'weeks'
    """
    if not t_delta:
        return ''

    # Convert t_delta to integer seconds.
    if input_type == 'timedelta':
        remainder = int(t_delta.total_seconds())
    elif input_type in ['s', 'seconds']:
        remainder = int(t_delta)
    elif input_type in ['m', 'minutes']:
        remainder = int(t_delta)*60
    elif input_type in ['h', 'hours']:
        remainder = int(t_delta)*3600
    elif input_type in ['d', 'days']:
        remainder = int(t_delta)*86400
    elif input_type in ['w', 'weeks']:
        remainder = int(t_delta)*604800
    else:
        return None

    formatter = Formatter()
    desired_fields = [field_tuple[1] for field_tuple in formatter.parse(fmt)]
    possible_fields = ('W', 'D', 'H', 'M', 'S')
    constants = {'W': 604800, 'D': 86400, 'H': 3600, 'M': 60, 'S': 1}
    values = {}
    for field in possible_fields:
        if field in desired_fields and field in constants:
            values[field], remainder = divmod(remainder, constants[field])
    return formatter.format(fmt, **values)


# def scale(drawing, scaling_factor):
#     """
#     Scale a reportlab.graphics.shapes.Drawing()
#     object while maintaining the aspect ratio
#     """
#     scaling_x = scaling_y = scaling_factor

#     drawing.width = drawing.minWidth() * scaling_x
#     drawing.height = drawing.height * scaling_y
#     drawing.scale(scaling_x, scaling_y)
#     return drawing


def resize_image(input_image_path, output_image_path, size):
    """
    Resize the input_image_path to the specified size and save the new image to
    the output_image_path
    """
    original_image = pil_Image.open(input_image_path)
    # width, height = original_image.size
    resized_image = original_image.resize(size)
    # width, height = resized_image.size
    resized_image.save(output_image_path)
