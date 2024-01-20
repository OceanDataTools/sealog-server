#!/usr/bin/env python3
'''
FILE:           sealog_vehicle_data_export.py

DESCRIPTION:    This script exports all the data for a given lowering, creates
                all the reports for that lowering, and pushes the data to the
                OpenVDM data directory for that lowering.

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2018-11-07
REVISION:   2022-02-13

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import sys
import os
import json
import logging
import tempfile
import subprocess
import glob
from datetime import datetime

from os.path import dirname, realpath
sys.path.append(dirname(dirname(realpath(__file__))))

from misc.python_sealog.settings import API_SERVER_FILE_PATH
from misc.python_sealog.cruises import get_cruises, get_cruise_by_id, get_cruise_by_lowering
from misc.python_sealog.lowerings import get_lowerings, get_lowering_by_id, get_lowerings_by_cruise
from misc.python_sealog.misc import get_framegrab_list_by_lowering
from misc.python_sealog.events import get_events_by_lowering
from misc.python_sealog.event_aux_data import get_event_aux_data_by_lowering
from misc.python_sealog.event_exports import get_event_export, get_event_exports_by_lowering
from misc.python_sealog.event_templates import get_event_templates
from misc.filecrop_utility import FileCropUtility

from misc.reporting.sealog_build_cruise_summary_report_Sub import CruiseSummaryReport
#from misc.reporting.sealog_build_lowering_sample_report_soi import LoweringSampleReport
from misc.reporting.sealog_build_lowering_summary_report import LoweringSummaryReport
from misc.reporting.sealog_build_lowering_vehicle_report import LoweringVehicleReport

# Location of exported files
EXPORT_ROOT_DIR = '/Users/webbpinner/Desktop/Sealog-Related/sealog-exports'
# EXPORT_ROOT_DIR = '/data/sealog-Sub-export'

# Name of Vehicle
VEHICLE_NAME = 'SuBastian'

# data source name in aux_data records containing vehicle position
NAV_DATASOURCE = 'vehicleRealtimeNavData'

# Location of Cruise Data directory
RAW_DATA_DIR = '/mnt/soi_data1/vault/CruiseData/'

# Location of cropped data files
CROPPED_DATA_DIR = '/data/sealog_Sub_cropped_data'

# Location withing OpenVDM cruise data directory to find OpenRVDAS data files.
OPENRVDAS_SOURCE_DIR = 'Falkor_too/Raw/OpenRVDAS'

# Destination within lowering directory to save cropped OpenRVDAS files.
OPENRVDAS_DEST_DIR = 'OpenRVDAS'

# Destination within cruise data directory to save cruise reports.
POST_CRUISE_REPORT_DIR = 'Vehicles/SuBastian'

# Array of OpenRVDAS files to crop
DATA_FILES_DEFS = [
    { 'source_regex': '*_pt_uaf_oxygen-*', 'output_prefix': 'pt_uaf_oxygen_'},
    { 'source_regex': '*_pt_whoi_mag-*', 'output_prefix': 'pt_whoi_mag_'},
    { 'source_regex': '*_pt_pmel_mapr-*', 'output_prefix': 'pt_pmel_mapr_'},
    { 'source_regex': '*sb_ctd_sbe49-*', 'output_prefix': 'sb_ctd_sbe49_'},
    { 'source_regex': '*sb_ctd_sbe49_depth_corr-*', 'output_prefix': 'sb_ctd_sbe49_depth_corr_'},
    { 'source_regex': '*sb_ctd_uvsvx-*', 'output_prefix': 'sb_ctd_uvsvx_'},
    { 'source_regex': '*sb_ctd_uvsvx_depth_corr-*', 'output_prefix': 'sb_ctd_uvsvx_depth_corr_'},
    { 'source_regex': '*sb_ctd_uvsvx_depth_teos-*', 'output_prefix': 'sb_ctd_uvsvx_depth_teos_'},
    { 'source_regex': '*sb_hightemp_pt100-*', 'output_prefix': 'sb_hightemp_pt100_'},
    { 'source_regex': '*sb_mech_comps-*', 'output_prefix': 'sb_mech_comps_'},
    { 'source_regex': '*sb_mech_valves-*', 'output_prefix': 'sb_mech_valves_'},
    { 'source_regex': '*sb_oxygen-*', 'output_prefix': 'sb_oxygen_'},
    { 'source_regex': '*sb_oxygen_corr-*', 'output_prefix': 'sb_oxygen_corr_'},
    { 'source_regex': '*sb_paro-*', 'output_prefix': 'sb_paro_'},
    { 'source_regex': '*sb_paro_depth_corr-*', 'output_prefix': 'sb_paro_depth_corr_'},
    { 'source_regex': '*sb_sprint-*', 'output_prefix': 'sb_sprint_'},
    { 'source_regex': '*sb_sprint_depth_corr-*', 'output_prefix': 'sb_sprint_depth_corr_'},
    { 'source_regex': '*sb_sprint_diag-*', 'output_prefix': 'sb_sprint_diag_'},
    { 'source_regex': '*sb_sprint_psonnav-*', 'output_prefix': 'sb_sprint_psonnav_'},
    { 'source_regex': '*usbl_gga_alpha-*', 'output_prefix': 'usbl_gga_alpha_'},
    { 'source_regex': '*usbl_gga_foxtrot-*', 'output_prefix': 'usbl_gga_foxtrot_'}
]

# OpenVDM Connetion information
OPENVDM_IP='10.23.9.20'
OPENVDM_USER='mt'
OPENVDM_SSH_KEY='/home/mt/.ssh/id_rsa_openvdm'
CRUISEDATA_DIR_ON_DATA_WAREHOUSE='/mnt/soi_data1/vault/CruiseData'
OPENVDM_VEHICLE_DIR='Vehicles/' + VEHICLE_NAME
SEALOG_DIR='Sealog'

# Flag to create the lowering directory within the cruise data directory if it
# does not exist.
CREATE_DEST_DIR = False

# Local file paths to the sealog-server files. 
CRUISES_FILE_PATH = os.path.join(API_SERVER_FILE_PATH, 'cruises')
IMAGES_FILE_PATH = os.path.join(API_SERVER_FILE_PATH, 'images')
LOWERINGS_FILE_PATH = os.path.join(API_SERVER_FILE_PATH, 'lowerings')

# Directory names used in various parts of the export process
REPORTS_DIRNAME = 'Reports'
IMAGES_DIRNAME = 'Images'
FILES_DIRNAME = 'Files'

def _export_dir_name(cruise_id, lowering_id):
    '''
    Build the SOI LoweringID used in OpenVDM
    '''

    if lowering_id[1:].isnumeric():
        return cruise_id + '_' + lowering_id

    return lowering_id


def _verify_source_directories():
    '''
    Verify all required source directories exists
    '''

    if not os.path.isdir(CRUISES_FILE_PATH):
        logging.warning("Cannot find cruises file path: %s" % CRUISES_FILE_PATH)
        return False, "Cannot find cruises file path: %s" % CRUISES_FILE_PATH

    if not os.path.isdir(IMAGES_FILE_PATH):
        return False, "Cannot find images file path: %s" % IMAGES_FILE_PATH

    if not os.path.isdir(LOWERINGS_FILE_PATH):
        return False, "Cannot find lowerings file path: %s" % LOWERINGS_FILE_PATH

    return True, ''


def _build_cruise_export_dirs(cruise):
    '''
    Build directory structure for exported cruise files.
    '''

    logging.info("Building cruise-level export directories")

    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id']))
    except FileExistsError:
        logging.debug("cruise export directory already exists")
    except Exception as err:
        logging.error("Could not create cruise export directory")
        logging.debug(str(err))
        sys.exit(1)

    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], REPORTS_DIRNAME))
    except FileExistsError:
        logging.debug("cruise export reports directory already exists")
    except Exception as err:
        logging.error("Could not create cruise reports export directory")
        logging.debug(str(err))
        sys.exit(1)

    # try:
    #     os.mkdir(os.path.join(CROPPED_DATA_DIR, cruise['cruise_id']))
    # except FileExistsError:
    #     logging.debug("cruise cropped data export directory already exists")
    # except Exception as err:
    #     logging.error("Could not create cruise cropped data export directory: %s", os.path.join(CROPPED_DATA_DIR, cruise['cruise_id']))
    #     logging.debug(str(err))
    #     sys.exit(1)


def _build_lowering_export_dirs(cruise, lowering): #pylint: disable=redefined-outer-name
    '''
    Build directory structure for exported lowering files.
    '''

    logging.info("Building lowering-level export directories")
    logging.debug(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id'])))
    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id'])))
    except FileExistsError:
        logging.debug("lowering export directory already exists")
    except Exception as err:
        logging.error("Could not create lowering export directory")
        logging.debug(str(err))
        sys.exit(1)

    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), REPORTS_DIRNAME))
    except FileExistsError:
        logging.debug("lowering export reports directory already exists")
    except Exception as err:
        logging.error("Could not create lowering reports export directory")
        logging.debug(str(err))
        sys.exit(1)

    try:
        os.mkdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME))
    except FileExistsError:
        logging.debug("lowering export images directory already exists")
    except Exception as err:
        logging.error("Could not create lowering images export directory")
        logging.debug(str(err))
        sys.exit(1)

    try:
        logging.info(os.path.join(CROPPED_DATA_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR))
        os.makedirs(os.path.join(CROPPED_DATA_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR))
    except FileExistsError:
        logging.debug("lowering export directory already exists")
    except Exception as err:
        logging.error("Could not create lowering export directory")
        logging.debug(str(err))
        sys.exit(1)


def _build_lowering_marker(lowering): #pylint: disable=redefined-outer-name
    '''
    Return a csv-formatted line containing the location on_bottom location for
    the given marker
    '''

    try:
        on_bottom_event = list(filter(lambda event: event['ts'] == lowering['lowering_additional_meta']['milestones']['lowering_on_bottom'], get_events_by_lowering(lowering['id'])))[0]

    except Exception as err:
        logging.warning('Could not find on_bottom milestone for lowering %s', lowering['lowering_id'])
        logging.debug(str(err))
        return None

    try:
        on_bottom_event_export = get_event_export(on_bottom_event['id'])
        # logging.debug("on_bottom_event_export: %s", json.dumps(on_bottom_event_export, indent=2))
        vehicle_realtime_nav_data = list(filter(lambda aux_data: aux_data['data_source'] == NAV_DATASOURCE, on_bottom_event_export['aux_data']))[0]
        # logging.debug("vehicle_realtime_nav_data: %s", vehicle_realtime_nav_data)
        lat = list(filter(lambda data_item: data_item['data_name'] == 'latitude', vehicle_realtime_nav_data['data_array']))[0]['data_value']
        lon = list(filter(lambda data_item: data_item['data_name'] == 'longitude', vehicle_realtime_nav_data['data_array']))[0]['data_value']
        depth = list(filter(lambda data_item: data_item['data_name'] == 'depth', vehicle_realtime_nav_data['data_array']))[0]['data_value']

        # DiveID,lat,Lon,depth.txt
        return lowering['lowering_id'] + ',' + str(lat) + ',' + str(lon) + ',' + str(depth * -1)

    except Exception as err:
        logging.warning('Could not extract nav data from on_bottom event for lowering: %s', lowering['lowering_id'])
        logging.debug(str(err))

    return None


def _export_lowering_markers_file(cruise):
    '''
    Build a csv-formatted file containing csv markers for all lowerings in the
    given cruise.
    '''

    logging.info("Exporting lowering markers file")

    cruise_lowerings = get_lowerings_by_cruise(cruise['id'])

    lowering_markers = []

    for cruise_lowering in cruise_lowerings:

        lowering_marker = _build_lowering_marker(cruise_lowering)
        # logging.debug(lowering_marker)

        if lowering_marker:
            lowering_markers.append(lowering_marker)

    filename = VEHICLE_NAME + '_' + cruise['cruise_id'] + '_loweringMarkers.txt'
    dest_filepath = os.path.join(API_SERVER_FILE_PATH, 'cruises', cruise['id'], filename)

    try:
        with open(dest_filepath, 'w') as file:
            for marker in lowering_markers:
                # logging.debug(marker)
                file.write(marker + '\r\n')
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))


def _export_lowering_sealog_data_files(cruise, lowering): # pylint: disable=too-many-statements, redefined-outer-name
    '''
    Export data from the database in csv and json formats for the given cruise
    and lowering
    '''

    logging.info("Exporting lowering-level data files")

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_loweringRecord.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Lowering Record: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(lowering))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_eventOnlyExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Events (json-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_events_by_lowering(lowering['id'])))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_eventOnlyExport.csv'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Events (csv-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(get_events_by_lowering(lowering['id'], 'csv'))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_auxDataExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Aux Data: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_aux_data_by_lowering(lowering['id'])))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_sealogExport.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Events with Aux Data (json-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_exports_by_lowering(lowering['id'], add_record_ids=True)))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_sealogExport.csv'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Events with Aux Data (csv-format): %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(get_event_exports_by_lowering(lowering['id'], 'csv', add_record_ids=True))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_eventTemplates.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), filename)

    logging.info("Export Event Templates: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_templates()))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    logging.info("Export Images")
    framegrab_list = get_framegrab_list_by_lowering(lowering['id'])
    existing_framegrab_list = os.listdir(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME))
    delete_framegrab_list = list(set(existing_framegrab_list) - set([os.path.basename(filepath) for filepath in framegrab_list]))

    if delete_framegrab_list:
        for filename in delete_framegrab_list:
            try:
                logging.info('Deleting: %s', filename)
                os.remove(os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME, filename))
            except:
                pass

    with tempfile.NamedTemporaryFile(mode='w+b', delete=False) as file:
        for framegrab in framegrab_list:

            framegrab = os.path.basename(framegrab)
            file.write(str.encode(framegrab + '\n'))

        file.seek(0,0)

        subprocess.call(['rsync','-avi','--progress', '--files-from=' + file.name , os.path.join(API_SERVER_FILE_PATH, 'images', ''), os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME)])

    # logging.info("Export Reports")
    # subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering['id'], ''), os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), REPORTS_DIRNAME)])

    # logging.info("Export Nav CSV")
    # subprocess.call(['rsync','-avi','--progress', os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering['id'], VEHICLE_NAME + '_' + lowering['lowering_id'] + '_nav.csv'), os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']))])


def _export_lowering_openrvdas_data_files(cruise, lowering): #pylint: disable=redefined-outer-name
    '''
    Cropped and export the OpenRVDAS files for the given cruise/lowering
    '''

    logging.info("Exporting lowering-level OpenRVDAS data files")

    fcu = FileCropUtility(datetime.strptime(lowering['start_ts'], '%Y-%m-%dT%H:%M:%S.%fZ'), datetime.strptime(lowering['stop_ts'], '%Y-%m-%dT%H:%M:%S.%fZ'), header=True)

    for data_file_def in DATA_FILES_DEFS:

        source_regex = os.path.join(RAW_DATA_DIR,cruise['cruise_id'], OPENRVDAS_SOURCE_DIR, data_file_def['source_regex'])
        source_files = glob.glob(os.path.join(RAW_DATA_DIR,cruise['cruise_id'], OPENRVDAS_SOURCE_DIR, data_file_def['source_regex']))
        destination_file = os.path.join(CROPPED_DATA_DIR,cruise['cruise_id'],_export_dir_name(cruise['cruise_id'], lowering['lowering_id']),OPENRVDAS_DEST_DIR,cruise['cruise_id'] + '_' + data_file_def['output_prefix'] + lowering['lowering_id'] + '.txt')

        logging.debug('Source regex: %s', source_regex)
        logging.debug('Source files: \n\t%s', '\n\t'.join(source_files))
        logging.debug('Destination file: %s', destination_file)

        try:
            culled_files = fcu.cull_files(source_files)
            logging.debug("Culled Files:\n\t%s",'\n\t'.join(culled_files))

            if len(culled_files) > 0:
                with open(destination_file, 'w', encoding='utf-8') as file:
                    for line in fcu.crop_file_data(culled_files):
                        file.write(line)
            else:
                logging.warning("No files containing data in the specified range")

        except Exception as err:
            logging.warning("Could not create cropped data file: %s", destination_file)
            logging.debug(str(err))

def _export_lowering_nav_csv_files(lowering): #pylint: disable=redefined-outer-name
    '''
    Export the csv-formatting file containing the lowering markers
    '''

    logging.info("Exporting lowering nav data to csv")

    dest_dir = os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering['id'])
    filename = VEHICLE_NAME + '_' + lowering['lowering_id'] + '_nav.csv'

    lowering_export = ExportLoweringNav2CSV(lowering['lowering_id'])

    try:
        with open(os.path.join(dest_dir, filename), 'w') as out_file:
            out_file.write(str(lowering_export))

    except IOError:
        logging.error("Error saving nav csv export file: %s", os.path.join(dest_dir, filename))


def _export_cruise_sealog_data_files(cruise):
    '''
    Export the cruise-level sealog data files
    '''

    logging.info("Exporting cruise-level data files")

    filename = cruise['cruise_id'] + '_' + VEHICLE_NAME + '_cruiseRecord.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Cruise Record: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(cruise))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    filename = cruise['cruise_id'] + '_' + VEHICLE_NAME + '_eventTemplates.json'
    dest_filepath = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], filename)

    logging.info("Export Event Templates: %s", filename)
    try:
        with open(dest_filepath, 'w') as file:
            file.write(json.dumps(get_event_templates()))
    except Exception as err:
        logging.error('could not create data file: %s', dest_filepath)
        logging.debug(str(err))

    # logging.info("Export Reports")
    # subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(API_SERVER_FILE_PATH, 'cruises', cruise['id'], ''), os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'], REPORTS_DIRNAME)])


def _build_cruise_reports(cruise):
    '''
    Build the cruise report(s) for the given cruise
    '''

    logging.info("Building cruise reports")

    report_dest_dir = os.path.join(API_SERVER_FILE_PATH, 'cruises', cruise['id'])

    report_filename = cruise['cruise_id'] + '_' + VEHICLE_NAME + '_Cruise_Summary_Report.pdf'
    logging.info("Building Cruise Summary Report: %s", report_filename)
    cruise_summary_report = CruiseSummaryReport(cruise['id'])

    try:
        with open(os.path.join(report_dest_dir, report_filename), 'wb') as file:
            file.write(cruise_summary_report.export_pdf())

    except Exception as err:
        logging.error("Unable to build report")
        logging.debug(str(err))


def _build_lowering_reports(cruise, lowering): #pylint: disable=redefined-outer-name
    '''
    Build the lowering reports for the given cruise and lowering
    '''

    logging.info("Building lowering reports")

    report_dest_dir = os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering['id'])

    summary_report_filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_Summary_Report.pdf'
    logging.info("Building Lowering Summary Report: %s", summary_report_filename)
    lowering_summary_report = LoweringSummaryReport(lowering['id'])

    try:
        with open(os.path.join(report_dest_dir, summary_report_filename), 'wb') as file:
            file.write(lowering_summary_report.export_pdf())

    except Exception as err:
        logging.error("Unable to build report")
        logging.error(str(err))

    vehicle_report_filename = cruise['cruise_id'] + '_' + lowering['lowering_id'] + '_Vehicle_Report.pdf'
    logging.info("Building Lowering Vehicle Report: %s", vehicle_report_filename)
    lowering_vehicle_report = LoweringVehicleReport(lowering['id'])

    try:
        with open(os.path.join(report_dest_dir, vehicle_report_filename), 'wb') as file:
            file.write(lowering_vehicle_report.export_pdf())

    except Exception as err:
        logging.error("Unable to build report")
        logging.error(str(err))


def _push_2_data_warehouse(cruise, lowerings): #pylint: disable=redefined-outer-name
    '''
    Push the exported files to the Cruise Data Warehouse
    '''

    cruise_source_dir = os.path.join(EXPORT_ROOT_DIR, cruise['cruise_id'])
    if not os.path.isdir(cruise_source_dir):
        logging.error('Exported directory for cruise data not found')
        return

    logging.info("Export Reports")
    subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(API_SERVER_FILE_PATH, 'cruises', cruise['id'], ''), os.path.join(cruise_source_dir, REPORTS_DIRNAME)])

    # rsync cruise-level report from sealog-subastion to cruise data directory
    command = [
        'rsync',
        '-trimv',
        '--progress',
        '-e',
        'ssh -i ' + OPENVDM_SSH_KEY,
        os.path.join(cruise_source_dir, REPORTS_DIRNAME, ''),
        OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], POST_CRUISE_REPORT_DIR, '')
    ]

    logging.debug(' '.join(command))
    subprocess.call(command)

    for lowering in lowerings: # pylint: disable=redefined-outer-name

        lowering_source_dir = os.path.join(cruise_source_dir, _export_dir_name(cruise['cruise_id'], lowering['lowering_id']))

        logging.info("Export Reports")
        subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(API_SERVER_FILE_PATH, 'lowerings', lowering['id'], ''), os.path.join(lowering_source_dir, REPORTS_DIRNAME)])
        
        if os.path.isdir(lowering_source_dir):
            if CREATE_DEST_DIR:

                # creates sealog directory within lowering folder
                command = [
                    'ssh',
                    '-i',
                    OPENVDM_SSH_KEY,
                    OPENVDM_USER + '@' + OPENVDM_IP,
                    'cd ' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], OPENVDM_VEHICLE_DIR ) + '; test -d ' + os.path.join(_export_dir_name(cruise['cruise_id'], lowering['lowering_id']), SEALOG_DIR) + ' || mkdir -p ' + os.path.join(_export_dir_name(cruise['cruise_id'], lowering['lowering_id']), SEALOG_DIR) + ''
                ]

                logging.debug(' '.join(command))
                subprocess.call(command)

            # rsyncs sealog data to destination folder
            command = ['rsync','-trimv',
                '--min-size=0',
                '--progress',
                '--delete',
                '-e',
                'ssh -i ' + OPENVDM_SSH_KEY,
                os.path.join(lowering_source_dir, ''),
                OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join( CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], OPENVDM_VEHICLE_DIR, _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), SEALOG_DIR, '')
            ]
            logging.debug(' '.join(command))
            subprocess.call(command)

        else:
            logging.error('Exported directory for lowering data not found')

        cropped_source_dir = os.path.join(CROPPED_DATA_DIR, cruise['cruise_id'], _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR)
        if os.path.isdir(cropped_source_dir):
            if CREATE_DEST_DIR:

                # creates openrvdas directory within lowering folder
                command = [
                    'ssh',
                    '-i',
                    OPENVDM_SSH_KEY,
                    OPENVDM_USER + '@' + OPENVDM_IP,
                    'cd ' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], OPENVDM_VEHICLE_DIR ) + '; test -d ' + os.path.join(_export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR) + ' || mkdir -p ' + os.path.join(_export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR) + ''
                ]

                logging.debug(' '.join(command))
                subprocess.call(command)

            # rsyncs openrvdas data to destination folder
            command = [
                'rsync',
                '-trimv',
                '--min-size=0',
                '--progress',
                '--delete',
                '-e',
                'ssh -i ' + OPENVDM_SSH_KEY,
                os.path.join(cropped_source_dir, ''),
                OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE, cruise['cruise_id'], OPENVDM_VEHICLE_DIR, _export_dir_name(cruise['cruise_id'], lowering['lowering_id']), OPENRVDAS_DEST_DIR, '')
            ]
            logging.debug(' '.join(command))
            subprocess.call(command)

        else:
            logging.error('Cropped data directory for lowering data not found')


if __name__ == '__main__':

    import argparse

    parser = argparse.ArgumentParser(description='Sealog ' + VEHICLE_NAME + ' Data export')
    parser.add_argument('-v', '--verbosity', dest='verbosity',
                        default=0, action='count',
                        help='Increase output verbosity')
    parser.add_argument('-n', '--no-transfer', action='store_true', default=False, help='build reports and export data but do not push to data warehouse')
    parser.add_argument('-t', '--transfer-only', action='store_true', default=False, help='only push the exproted data to data warehouse')
    parser.add_argument('-c', '--current_cruise', action='store_true', default=False, help=' export the data for the most recent cruise')
    parser.add_argument('-L', '--lowering_id', help='export data for the specified lowering (i.e. S0314)')
    parser.add_argument('-C', '--cruise_id', help='export all cruise and lowering data for the specified cruise (i.e. FK200126)')

    parsed_args = parser.parse_args()

    ############################
    # Set up logging before we do any other argument parsing (so that we
    # can log problems with argument parsing).

    LOGGING_FORMAT = '%(asctime)-15s %(levelname)s - %(message)s'
    logging.basicConfig(format=LOGGING_FORMAT)

    LOG_LEVELS = {0: logging.WARNING, 1: logging.INFO, 2: logging.DEBUG}
    parsed_args.verbosity = min(parsed_args.verbosity, max(LOG_LEVELS))
    logging.getLogger().setLevel(LOG_LEVELS[parsed_args.verbosity])

    if parsed_args.current_cruise and ( parsed_args.lowering_id or parsed_args.cruise_id ):
        logging.error("Can not specify current_cruise and also a lowering {(}-l{)} or cruise {(}-c{)}")
        sys.exit(0)

    if parsed_args.lowering_id and parsed_args.cruise_id:
        logging.error("Can not specify a lowering {(}-l{)} and cruise {(}-c{)}")
        sys.exit(0)

    selected_cruise = None # pylint: disable=invalid-name
    selected_lowerings = []

    # if exporting all lowerings for the current cruise
    if parsed_args.current_cruise:
        selected_cruise = next(iter(get_cruises()), None)

        if selected_cruise is None:
            logging.error("There are no cruises available for export")
            sys.exit(0)

        selected_lowerings = get_lowerings_by_cruise(selected_cruise['id'])

    # if exporting for all lowering from a specific cruise
    elif parsed_args.cruise_id:
        selected_cruise = get_cruise_by_id(parsed_args.cruise_id)

        if selected_cruise is None:
            logging.error("Cruise %s not found", parsed_args.cruise_id)
            sys.exit(0)

        selected_lowerings = get_lowerings_by_cruise(selected_cruise['id'])

    # if exporting for a specific lowering
    elif parsed_args.lowering_id:
        selected_lowerings = [get_lowering_by_id(parsed_args.lowering_id)]

        if selected_lowerings[0] is None:
            logging.error("Lowering %s not found", parsed_args.lowering_id)
            sys.exit(0)

        selected_cruise = get_cruise_by_lowering(selected_lowerings[0]['id'])

    # if exporting for the most recent lowering
    else:
        selected_lowerings = [next(iter(get_lowerings()), None)]

        if selected_lowerings[0] is None:
            logging.error("There are no lowerings available for export")
            sys.exit(0)

        selected_cruise = get_cruise_by_lowering(selected_lowerings[0]['id'])

    if len(selected_lowerings) == 0:
        logging.warning("There are no lowerings for the specified cruise")

    logging.info("Exporting the follow data:")
    logging.info("\tCruise: %s", selected_cruise['cruise_id'])
    logging.info("\tLowering(s): %s", ', '.join([lowering['lowering_id'] for lowering in selected_lowerings]) if len(selected_lowerings) > 0 else "\t NONE")

    if parsed_args.transfer_only:
        _push_2_data_warehouse(selected_cruise, selected_lowerings)
        logging.debug("Done")
        sys.exit(0)

    # Verify source directories
    success, msg = _verify_source_directories()
    if not success:
        logging.error(msg)
        sys.exit(0)

    # Verify export root directory
    if not os.path.isdir(EXPORT_ROOT_DIR):
        logging.error("Cannot find export directory: %s", EXPORT_ROOT_DIR)
        sys.exit(1)

    # current_cruise source dir
    cruise_source_dir = os.path.join(CRUISES_FILE_PATH, selected_cruise['id'])

    #verify cruise source directory exists
    try:
        os.path.isdir(cruise_source_dir)
    except Exception as err:
        logging.error('Cannot find source directory for cruise: %s', cruise_source_dir)
        sys.exit(1)

    # build cruise export dirs
    _build_cruise_export_dirs(selected_cruise)

    # export cruise data files
    _export_cruise_sealog_data_files(selected_cruise)

    # build cruise report
    _build_cruise_reports(selected_cruise)

    # export lowering markers file
    # _export_lowering_markers_file(selected_cruise)

    # for each lowering in cruise
    for selected_lowering in selected_lowerings:
        logging.info("Exporting data for lowering: %s", selected_lowering['lowering_id'])

        # lowering source dir
        lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, selected_lowering['id'])

        #verify cruise source directory exists
        if not os.path.isdir(lowering_source_dir):
            logging.error('Cannot find source directory for lowering: %s', lowering_source_dir)
            sys.exit(1)

        # build lowering export dirs
        # _build_lowering_export_dirs(selected_cruise, selected_lowering)

        # export lowering cropped data files
        _export_lowering_openrvdas_data_files(selected_cruise, selected_lowering)

        # export lowering data files
        _export_lowering_sealog_data_files(selected_cruise, selected_lowering)

        # build lowering reports
        _build_lowering_reports(selected_cruise, selected_lowering)

        # export lowering nav2csv data file
        # _export_lowering_nav_csv_files(selected_lowering)

    # sync data to data warehouse
    if not parsed_args.no_transfer:
        _push_2_data_warehouse(selected_cruise, selected_lowerings)

    logging.debug("Done")

