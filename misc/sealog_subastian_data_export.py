#!/usr/bin/env python3
#
#  Purpose: This script takes a lowering ID and renav raw CTD file and 
#           creates new aux_data records within Sealog
#
#    Usage: Type python3 merge_ctd.py <lowering_id> <raw_ctd_file> to run the script.
#            - <lowering_id>: the lowering ID (J2-1042)
#            - <raw_ctd_file>: the raw_ctd_file name with absolute/relative path (./UDP-SB-CTD-RAW_20200128-234312.Raw)
#
#   Author: Webb Pinner webbpinner@gmail.com
#  Created: 2018-11-07
# Modified: 2020-02-21
# from python_sealog.settings import apiServerURL, apiServerFilePath, cruisesAPIPath, eventsAPIPath, customVarAPIPath, headers
import logging
import tempfile
import subprocess
import requests
import json
import os

from python_sealog.settings import apiServerFilePath
from python_sealog.cruises import getCruises, getCruiseByID, getCruiseByLowering
from python_sealog.lowerings import getLowerings, getLoweringByID, getLoweringsByCruise
from python_sealog.misc import getFramegrabListByLowering
from python_sealog.events import getEventsByLowering
from python_sealog.event_aux_data import getEventAuxDataByLowering
from python_sealog.event_exports import getEventExportsByLowering
from python_sealog.event_templates import getEventTemplates

from sealog_build_cruise_summary_report import CruiseSummaryReport

from sealog_build_lowering_sample_report import LoweringSampleReport
from sealog_build_lowering_summary_report import LoweringSummaryReport
from sealog_build_lowering_vehicle_report import LoweringVehicleReport

BACKUP_ROOT_DIR = '/home/mt/sealog-subastian-backups'

CRUISES_FILE_PATH = os.path.join(apiServerFilePath, 'cruises')
IMAGES_FILE_PATH = os.path.join(apiServerFilePath, 'images')
LOWERINGS_FILE_PATH = os.path.join(apiServerFilePath, 'lowerings')

REPORTS_DIRNAME = 'Reports'
IMAGES_DIRNAME = 'Framegrabs'
FILES_DIRNAME = 'Files'

OPENVDM_IP='10.23.9.200'
OPENVDM_USER='mt'
CRUISEDATA_DIR_ON_DATA_WAREHOUSE='/net/soi_data1/CruiseData'
OPENVDM_VEHICLE_DIR='Subastian'
SEALOG_DIR='Sealog'

# default log level
LOG_LEVEL = logging.INFO

# create logger
logging.basicConfig(level=LOG_LEVEL,
                    # format='%(asctime)s - %(name)s:%(lineno)s - %(levelname)s - %(message)s'
                    format='%(levelname)s - %(message)s'
                   )

logger = logging.getLogger(__file__)

def _exportDirName(cruise_id, lowering_id):
  if lowering_id[1:].isnumeric():
    return cruise_id + '_' + lowering_id

  return lowering_id


def _verifySourceDirectories():

  if not os.path.isdir(CRUISES_FILE_PATH):
    return False, "cannot find cruises file path"

  if not os.path.isdir(IMAGES_FILE_PATH):
    return False, "cannot find images file path"

  if not os.path.isdir(LOWERINGS_FILE_PATH):
    return False, "cannot find lowerings file path"

  return True, ''


def _buildCruiseBackupDirs(cruise):

  logger.info("Building cruise-level backup directories")

  try:
    os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id']))
  except FileExistsError:
    logger.debug("cruise backup directory already exists")
  except Exception as error:
    logger.error("Could not create cruise backup directory")
    sys.exit(1)

  try:
    os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], REPORTS_DIRNAME))
  except FileExistsError:
    logger.debug("cruise backup reports directory already exists")
  except Exception as error:
    logger.error("Could not create cruise reports backup directory")
    sys.exit(1)


def _buildLoweringBackupDirs(cruise, lowering):

  logger.info("Building lowering-level backup directories")

  try:
    os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id'])))
  except FileExistsError:
    logger.debug("lowering backup directory already exists")
  except Exception as error:
    logger.error("Could not create lowering backup directory")
    sys.exit(1)

  try:
    os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), REPORTS_DIRNAME))
  except FileExistsError:
    logger.debug("lowering backup reports directory already exists")
  except Exception as error:
    logger.error("Could not create lowering reports backup directory")
    sys.exit(1)

  try:
    os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME))
  except FileExistsError:
    logger.debug("lowering backup images directory already exists")
  except Exception as error:
    logger.error("Could not create lowering images backup directory")
    sys.exit(1)

  # try:
  #   os.mkdir(os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), FILES_DIRNAME))
  # except FileExistsError:
  #   logger.debug("lowering backup files directory already exists")
  # except Exception as error:
  #   logger.error("Could not create lowering files backup directory")
  #   sys.exit(1)


def _exportLoweringDataFiles(cruise, lowering):

  logger.info("Exporting lowering-level data files")

  filename = lowering['lowering_id'] + '_loweringRecord.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Lowering Record: " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(lowering))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)

  filename = lowering['lowering_id'] + '_eventOnlyExport.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)

  logger.info("Export Events (json-format): " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(getEventsByLowering(lowering['id'])))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)


  filename = lowering['lowering_id'] + '_eventOnlyExport.csv'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Events (csv-format): " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(getEventsByLowering(lowering['id'], 'csv'))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)


  filename = lowering['lowering_id'] + '_auxDataExport.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Aux Data: " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(getEventAuxDataByLowering(lowering['id'])))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)


  filename = lowering['lowering_id'] + '_sealogExport.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Events with Aux Data (json-format): " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(getEventExportsByLowering(lowering['id'])))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)


  filename = lowering['lowering_id'] + '_sealogExport.csv'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Events with Aux Data (csv-format): " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(getEventExportsByLowering(lowering['id'], 'csv'))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)

  filename = lowering['lowering_id'] + '_eventTemplates.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), filename)
  
  logger.info("Export Event Templates: " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(getEventTemplates()))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)

  logger.info("Export Images")
  framegrabList = getFramegrabListByLowering(lowering['id'])
  rsync_filelist = tempfile.NamedTemporaryFile(mode='w+b', delete=False)
  for framegrab in framegrabList:

    framegrab = os.path.basename(framegrab)
    print(framegrab)
    rsync_filelist.write(str.encode(framegrab + '\n'))

  output = subprocess.call(['rsync','-avi','--progress', '--delete', '--files-from=' + rsync_filelist.name , os.path.join(apiServerFilePath, 'images', ''), os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), IMAGES_DIRNAME)])
  # logger.debug(output)

  rsync_filelist.close()

  logger.info("Export Reports")
  output = subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(apiServerFilePath, 'lowerings', lowering['id'], ''), os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), REPORTS_DIRNAME)])
  # logger.debug(output)

  # logger.info("Export Files")
  # output = subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.json', '--include=*.kml', '--exclude=*', os.path.join(apiServerFilePath, 'lowerings', lowering['id'], ''), os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), FILES_DIRNAME)])
  # logger.debug(output)


def _exportCruiseDataFiles(cruise):

  logger.info("Exporting cruise-level data files")

  filename = cruise['cruise_id'] + '_cruiseRecord.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], filename)
  
  logger.info("Export Cruise Record: " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(cruise))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)

  filename = cruise['cruise_id'] + '_eventTemplates.json'
  dest_filepath = os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], filename)

  logger.info("Export Event Templates: " + filename)
  try:
    with open(dest_filepath, 'w') as file:
      file.write(json.dumps(getEventTemplates()))
  except Exception as error:
    logger.error('could not create data file: ', dest_filepath)

  logger.info("Export Reports")
  output = subprocess.call(['rsync','-avi','--progress', '--delete', '--include=*.pdf', '--exclude=*', os.path.join(apiServerFilePath, 'cruises', cruise['id'], ''), os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], REPORTS_DIRNAME)])
  # logger.debug(output)



def _buildCruiseReports(cruise):

  logger.info("Building cruise reports")

  report_dest_dir = os.path.join(apiServerFilePath, 'cruises', cruise['id'])

  report_filename = cruise['cruise_id'] + '_Cruise_Summary_Report.pdf'
  logger.info("Building Cruise Summary Report: " + report_filename)
  PDF = CruiseSummaryReport(cruise['id'])

  try:
      f = open(os.path.join(report_dest_dir, report_filename), 'wb')
      f.write(PDF.build_pdf())
      f.close()
 
  except Exception as error:
      logger.error("Unable to build report")
      logger.error(str(error))


def _buildLoweringReports(cruise, lowering):

  logger.info("Building lowering reports")

  report_dest_dir = os.path.join(apiServerFilePath, 'lowerings', lowering['id'])

  report_filename = cruise['cruise_id'] + '_Dive_' + lowering['lowering_id'] + '_Dive_Sample_Report.pdf'
  logger.info("Building Lowering Sample Report: " + report_filename)
  PDF = LoweringSampleReport(lowering['id'])

  try:
    f = open(os.path.join(report_dest_dir, report_filename), 'wb')
    f.write(PDF.build_pdf())
    f.close()
 
  except Exception as error:
    logger.error("Unable to build report")
    logger.error(str(error))

  report_filename = cruise['cruise_id'] + '_Dive_' + lowering['lowering_id'] + '_Dive_Summary_Report.pdf'
  logger.info("Building Lowering Summary Report: " + report_filename)
  PDF = LoweringSummaryReport(lowering['id'])

  try:
    f = open(os.path.join(report_dest_dir, report_filename), 'wb')
    f.write(PDF.build_pdf())
    f.close()
 
  except Exception as error:
    logger.error("Unable to build report")
    logger.error(str(error))

  report_filename = cruise['cruise_id'] + '_Dive_' + lowering['lowering_id'] + '_Dive_Vehicle_Report.pdf'
  logger.info("Building Lowering Vehicle Report: " + report_filename)
  PDF = LoweringVehicleReport(lowering['id'])

  try:
    f = open(os.path.join(report_dest_dir, report_filename), 'wb')
    f.write(PDF.build_pdf())
    f.close()
 
  except Exception as error:
    logger.error("Unable to build report")
    logger.error(str(error))


def _pushToDataWarehouse(cruise, lowering):

  logger.debug(' '.join(['rsync','-avin','--progress', '--delete', '-e ssh', os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), ''), OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE,cruise['cruise_id'],OPENVDM_VEHICLE_DIR,_exportDirName(cruise['cruise_id'], lowering['lowering_id']),SEALOG_DIR, '')]))
  output = subprocess.call(['rsync','-avin','--progress', '--delete', '-e ssh', os.path.join(BACKUP_ROOT_DIR, cruise['cruise_id'], _exportDirName(cruise['cruise_id'], lowering['lowering_id']), ''), OPENVDM_USER + '@' + OPENVDM_IP + ':' + os.path.join(CRUISEDATA_DIR_ON_DATA_WAREHOUSE,cruise['cruise_id'],OPENVDM_VEHICLE_DIR,_exportDirName(cruise['cruise_id'], lowering['lowering_id']),SEALOG_DIR, '')])

if __name__ == '__main__':

  import argparse
  import sys

  parser = argparse.ArgumentParser(description='Sealog Subastian Data export')
  parser.add_argument('-d', '--debug', action='store_true', help=' display debug messages')
  parser.add_argument('-n', '--no-transfer', action='store_true', default=False, help='build reports and export data but do not push to data warehouse')
  parser.add_argument('-c', '--current_cruise', action='store_true', default=False, help=' export the data for the most recent cruise')
  parser.add_argument('-L', '--lowering_id', help='export data for the specified lowering (i.e. S0314)')
  parser.add_argument('-C', '--cruise_id', help='export all cruise and lowering data for the specified cruise (i.e. FK200126)')

  
  args = parser.parse_args()

  # Turn on debug mode
  if args.debug:
    logger.info("Setting log level to DEBUG")
    logger.setLevel(logging.DEBUG)

    for handler in logger.handlers:
      handler.setLevel(logging.DEBUG)

    logger.debug("Log level now set to DEBUG")

  if args.current_cruise:
    if args.lowering_id or args.cruise_id:
      logger.error("Can not specify current_cruise and also a lowering \(-l\) or cruise \(-c\)")
      sys.exit(0)

  elif args.lowering_id and args.cruise_id:
    logger.error("Can not specify a lowering \(-l\) and cruise \(-c\)")
    sys.exit(0)


  # Verify source directories
  success, msg = _verifySourceDirectories()
  if not success:
    logger.error(msg)
    sys.exit(0)

  # Verify backup root directory
  if not os.path.isdir(BACKUP_ROOT_DIR):
    logger.error("cannot find backup directory: " + BACKUP_ROOT_DIR)
    sys.exit(1)


  # Current Cruise Specified
  # ========================
  if args.current_cruise:

    # retrieve current cruise record
    current_cruise = next(iter(getCruises()), None)
    if not current_cruise:
      logger.error("Cruise not found.")
      sys.exit(1)

    logger.info("Cruise ID: " + current_cruise['cruise_id'])
    if 'cruise_name' in current_cruise['cruise_additional_meta']:
      logger.info("Cruise Name: " + current_cruise['cruise_additional_meta']['cruise_name'])

    # current_cruise source dir
    cruise_source_dir = os.path.join(CRUISES_FILE_PATH, current_cruise['id'])

    #verify current_cruise source directory exists
    try:
      os.path.isdir(cruise_source_dir)
    except:
      logger.error('cannot find source directory for cruise: ' + cruise_source_dir);
      sys.exit(1)

    # build cruise report
    _buildCruiseReports(current_cruise)

    # build cruise backup dir
    _buildCruiseBackupDirs(current_cruise)

    # export cruise data files
    _exportCruiseDataFiles(current_cruise)

    # retieve lowering records for current cruise
    current_lowerings = getLoweringsByCruise(current_cruise['id'])

    if len(current_lowerings) == 0:
      logger.warning("No lowerings found for current cruise")

    else:
      # for each lowering in cruise
      for lowering in current_lowerings:
        logger.info("Lowering: " + lowering['lowering_id'])

        # lowering source dir
        lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, lowering['id'])

        #verify current_cruise source directory exists
        if not os.path.isdir(lowering_source_dir):
          logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
          sys.exit(1)

        # build lowering reports
        _buildLoweringReports(current_cruise, lowering)

        # build lowering backup dir
        _buildLoweringBackupDirs(current_cruise, lowering)
        
        # export lowering data files
        _exportLoweringDataFiles(current_cruise, lowering)

        # sync data to data warehouse
        if not args.no_transfer:
          _pushToDataWarehouse(current_cruise, lowering)


  # Specified Cruise ID
  # ========================    
  elif args.cruise_id:

    # retrieve specified cruise record
    current_cruise = getCruiseByID(args.cruise_id)
    if not current_cruise:
      logger.error("Cruise not found.")
      sys.exit(1)

    logger.info("Cruise ID: " + current_cruise['cruise_id'])
    if 'cruise_name' in current_cruise['cruise_additional_meta']:
      logger.info("Cruise Name: " + current_cruise['cruise_additional_meta']['cruise_name'])

    # current_cruise source dir
    cruise_source_dir = os.path.join(CRUISES_FILE_PATH, current_cruise['id'])

    #verify current_cruise source directory exists
    try:
      os.path.isdir(cruise_source_dir)
    except:
      logger.error('cannot find source directory for cruise: ' + cruise_source_dir);
      sys.exit(1)

    # build cruise report
    _buildCruiseReports(current_cruise)

    # build cruise backup dir
    _buildCruiseBackupDirs(current_cruise)

    # export cruise data files
    _exportCruiseDataFiles(current_cruise)

    # retieve lowering records for current cruise
    current_lowerings = getLoweringsByCruise(current_cruise['id'])

    if len(current_lowerings) == 0:
      logger.warning("No lowerings found for current cruise")

    else:
      # for each lowering in cruise
      for lowering in current_lowerings:
        logger.info("Lowering: " + lowering['lowering_id'])

        # lowering source dir
        lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, lowering['id'])

        #verify current_cruise source directory exists
        if not os.path.isdir(lowering_source_dir):
          logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
          sys.exit(1)

        # build lowering reports
        _buildLoweringReports(current_cruise, lowering)

        # build lowering backup dir
        _buildLoweringBackupDirs(current_cruise, lowering)
        
        # export lowering data files
        _exportLoweringDataFiles(current_cruise, lowering)

        # sync data to data warehouse
        if not args.no_transfer:
          _pushToDataWarehouse(current_cruise, lowering)

  # Specified Lowering ID
  # ========================    
  elif args.lowering_id:

    # retieve specified lowering record
    current_lowering = getLoweringByID(args.lowering_id)

    if not current_lowering:
      logger.error("Lowering not found.")
      sys.exit(1)

    logger.debug("Lowering ID: " + current_lowering['lowering_id'])

    # current_lowering source dir
    lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, current_lowering['id'])

    #verify current_lowering source directory exists
    if not os.path.isdir(lowering_source_dir):
      logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
      sys.exit(1)

    # retrieve corresponding cruise record
    current_cruise = getCruiseByLowering(current_lowering['id'])

    if not current_cruise:
      logger.error("Lowering is not part of a cruise")
      sys.exit(1)

    logger.info("Cruise ID: " + current_cruise['cruise_id'])

    if 'cruise_name' in current_cruise['cruise_additional_meta']:
      logger.info("Cruise Name: " + current_cruise['cruise_additional_meta']['cruise_name'])

    # current_cruise source dir
    cruise_source_dir = os.path.join(CRUISES_FILE_PATH, current_cruise['id'])

    #verify current_cruise source directory exists
    try:
      os.path.isdir(cruise_source_dir)
    except:
      logger.error('cannot find source directory for cruise: ' + cruise_source_dir);
      sys.exit(1)

    # build cruise report
    _buildCruiseReports(current_cruise)

    # build cruise backup dir
    _buildCruiseBackupDirs(current_cruise)

    # export cruise data files
    _exportCruiseDataFiles(current_cruise)

    logger.info("Lowering: " + current_lowering['lowering_id'])

    # lowering source dir
    lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, current_lowering['id'])

    #verify current_cruise source directory exists
    if not os.path.isdir(lowering_source_dir):
      logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
      sys.exit(1)

    # build lowering reports
    _buildLoweringReports(current_cruise, current_lowering)

    # build lowering backup dir
    _buildLoweringBackupDirs(current_cruise, current_lowering)
    
    # export lowering data files
    _exportLoweringDataFiles(current_cruise, current_lowering)

    # sync data to data warehouse
    if not args.no_transfer:
      _pushToDataWarehouse(current_cruise, current_lowering)


  else:

    current_lowering = next(iter(getLowerings()), None)

    if not current_lowering:
      logger.error("Lowering not found.")
      sys.exit(1)

    logger.debug("Lowering ID: " + current_lowering['lowering_id'])

    # current_lowering source dir
    lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, current_lowering['id'])

    #verify current_lowering source directory exists
    if not os.path.isdir(lowering_source_dir):
      logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
      sys.exit(1)

    # retrieve corresponding cruise record
    current_cruise = getCruiseByLowering(current_lowering['id'])

    if not current_cruise:
      logger.error("Lowering is not part of a cruise")
      sys.exit(1)

        # build cruise report
    _buildCruiseReports(current_cruise)

    # build cruise backup dir
    _buildCruiseBackupDirs(current_cruise)

    # export cruise data files
    _exportCruiseDataFiles(current_cruise)

    logger.info("Lowering: " + current_lowering['lowering_id'])

    # lowering source dir
    lowering_source_dir = os.path.join(LOWERINGS_FILE_PATH, current_lowering['id'])

    #verify current_cruise source directory exists
    if not os.path.isdir(lowering_source_dir):
      logger.error('cannot find source directory for lowering: ' + lowering_source_dir);
      sys.exit(1)

    # build lowering reports
    _buildLoweringReports(current_cruise, current_lowering)

    # build lowering backup dir
    _buildLoweringBackupDirs(current_cruise, current_lowering)
    
    # export lowering data files
    _exportLoweringDataFiles(current_cruise, current_lowering)

    # sync data to data warehouse
    if not args.no_transfer:
      _pushToDataWarehouse(current_cruise, current_lowering)

  logger.debug("Done")