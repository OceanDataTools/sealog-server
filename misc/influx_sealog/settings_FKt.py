#!/usr/bin/env python3
'''
FILE:           settings.py

DESCRIPTION:    This file contains the settings used by the influx_sealog
				functions to communicate with the influxDB API

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-01-01
REVISION:	2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2024
'''

# URL to influx server
INFLUX_SERVER_URL = "http://10.23.9.24:8086"

# Influx server authorization token
INFLUX_TOKEN = "v4thZIR5_EsdMqOQWNJZ2HvfPLpWqynBD4NPwYJYFtW3XP7ifdX557vDpfGycveMdQ6LlPjmRHk7OFUuVzQM6Q=="

# Influx server org containing sensor data
INFLUX_ORG = "Schmidt Ocean Institute"

# Influx server bucket containing sensor data
INFLUX_BUCKET = "openrvdas"
