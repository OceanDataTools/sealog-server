#!/bin/bash
#
# Purpose: This script is used to import the modded lowering into Sealog
#
#   Usage: sealog_import_from_file.sh
#
#  Author: Webb Pinner webbpinner@gmail.com
# Created: 2024-04-27

# Directory where the script is being run from
_D="$(pwd)"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

PYTHON_BIN="${SCRIPT_DIR}/../venv/bin/python"

# TODO, implement this
# source ${SCRIPT_DIR}/preferences.sh

# Parent Directory of sealog database backups
DATA_DIR="/Users/webbpinner/Desktop/Sealog-Related/SOI_Subastian"

# Database connection information
DB_URI="mongodb://localhost:27017/"
CRUISE_DATABASE="sealogDB"
LOWERING_DATABASE="sealogDB"

# Patterns to match for directory/file names
CRUISE_PATTERN="FKt*"
CRUISE_RECORD_PATTERN="{cruise}_cruiseRecord.json"
CRUISE_EVENT_RECORD_PATTERN="{cruise}_eventOnlyExport.json"
CRUISE_AUX_DATA_RECORD_PATTERN="{cruise}_auxDataExport.json"

LOWERING_PATTERN="{cruise}_S*"
LOWERING_RECORD_PATTERN="{lowering}_loweringRecord.json"
LOWERING_EVENT_RECORD_PATTERN="{lowering}_eventOnlyExport.json"
LOWERING_AUX_DATA_RECORD_PATTERN="{lowering}_auxDataExport.json"


# Function to process just the cruise record
process_cruise_record() {

  local cruise="$1"
  local database="$2"

  # Cruise Record
  cruise_record="${CRUISE_RECORD_PATTERN//\{cruise\}/${cruise}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${cruise_record} ]; then
    echo "ERROR: Did not find cruise record file: ${cruise_record} in ${DATA_DIR}/${cruise}. Quitting."
    exit 1
  fi

  mkdir -p ${DATA_DIR}/${cruise}/modifiedForImport

  echo " - Processing cruise record..."
  cruise_mod_filepath="${DATA_DIR}/${cruise}/modifiedForImport/${cruise_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py cruise ${DATA_DIR}/${cruise}/${cruise_record} > ${cruise_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py cruise ${DATA_DIR}/${cruise}/${cruise_record}"
    exit 1
  fi

  echo " - Importing cruise record..."
  mongoimport --uri ${DB_URI} --db ${database} --collection cruises --file ${cruise_mod_filepath} --jsonArray --mode upsert

}


# Function to process an individual cruise
process_cruise() {

  local cruise="$1"
  local database="$2"
  echo "Cruise: ${cruise}"

  process_cruise_record ${cruise} ${database}

  # Event Record
  event_record="${CRUISE_EVENT_RECORD_PATTERN//\{cruise\}/${cruise}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${event_record} ]; then
    echo "ERROR: Did not find cruise record file: ${event_record} in ${DATA_DIR}/${cruise}. Quitting."
    exit 1
  fi

  echo " - Processing event records..."
  event_mod_filepath="${DATA_DIR}/${cruise}/modifiedForImport/${event_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py event ${DATA_DIR}/${cruise}/${event_record} > ${event_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py event ${DATA_DIR}/${cruise}/${event_record}"
    exit 1
  fi

  # Aux Data Record
  auxdata_record="${CRUISE_AUX_DATA_RECORD_PATTERN//\{cruise\}/${cruise}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${auxdata_record} ]; then
    echo "ERROR: Did not find cruise record file: ${auxdata_record} in ${DATA_DIR}/${cruise}. Quitting."
    exit 1
  fi

  echo " - Processing auxdata records..."
  auxdata_mod_filepath="${DATA_DIR}/${cruise}/modifiedForImport/${auxdata_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py aux_data ${DATA_DIR}/${cruise}/${auxdata_record} > ${auxdata_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py aux_data ${DATA_DIR}/${cruise}/${auxdata_record}"
    exit 1
  fi

  echo " - Importing cruise record..."
  mongoimport --uri ${DB_URI} --db ${database} --collection cruises --file ${cruise_mod_filepath} --jsonArray --mode upsert

  echo " - Importing cruise events"
  mongoimport --uri ${DB_URI} --db ${database} --collection events --file ${event_mod_filepath} --jsonArray --mode upsert

  echo " - Importing cruise aux data"
  mongoimport --uri ${DB_URI} --db ${database} --collection event_aux_data --file ${auxdata_mod_filepath} --jsonArray --mode upsert
}

# Function to process an individual lowering
process_lowering() {

  local lowering="$1"
  local database="$2"
  echo "Lowering: $lowering"

  # Lowering Record
  lowering_record="${LOWERING_RECORD_PATTERN//\{cruise\}/${cruise}}.json"
  lowering_record="${LOWERING_RECORD_PATTERN//\{lowering\}/${lowering}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${lowering}/${lowering_record} ]; then
    echo "ERROR: Did not find lowering record file: ${lowering_record} in ${DATA_DIR}/${cruise}/${lowering}. Quitting."
    exit 1
  fi

  mkdir -p ${DATA_DIR}/${cruise}/${lowering}/modifiedForImport

  echo " - Processing lowering record..."
  lowering_mod_filepath="${DATA_DIR}/${cruise}/${lowering}/modifiedForImport/${lowering_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py lowering ${DATA_DIR}/${cruise}/${lowering}/${lowering_record} > ${lowering_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py lowering ${DATA_DIR}/${cruise}/${lowering}/${lowering_record}"
    exit 1
  fi

  # Event Record
  event_record="${LOWERING_EVENT_RECORD_PATTERN//\{cruise\}/${cruise}}.json"
  event_record="${LOWERING_EVENT_RECORD_PATTERN//\{lowering\}/${lowering}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${lowering}/${event_record} ]; then
    echo "ERROR: Did not find lowering record file: ${event_record} in ${DATA_DIR}/${cruise}/${lowering}. Quitting."
    exit 1
  fi

  echo " - Processing event records..."
  event_mod_filepath="${DATA_DIR}/${cruise}/${lowering}/modifiedForImport/${event_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py event ${DATA_DIR}/${cruise}/${lowering}/${event_record} > ${event_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py event ${DATA_DIR}/${cruise}/${lowering}/${event_record}"
    exit 1
  fi

  # Aux Data Record
  auxdata_record="${LOWERING_AUX_DATA_RECORD_PATTERN//\{cruise\}/${cruise}}.json"
  auxdata_record="${LOWERING_AUX_DATA_RECORD_PATTERN//\{lowering\}/${lowering}}"
  if [ ! -f ${DATA_DIR}/${cruise}/${lowering}/${auxdata_record} ]; then
    echo "ERROR: Did not find lowering record file: ${auxdata_record} in ${DATA_DIR}/${cruise}/${lowering}. Quitting."
    exit 1
  fi

  echo " - Processing auxdata records..."
  auxdata_mod_filepath="${DATA_DIR}/${cruise}/${lowering}/modifiedForImport/${auxdata_record//.json/_mod.json}"
  ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py aux_data ${DATA_DIR}/${cruise}/${lowering}/${auxdata_record} > ${auxdata_mod_filepath}
  if [ $? -ne 0 ]; then
    echo "   ERROR: processing failed"
    echo " Command: ${PYTHON_BIN} ${SCRIPT_DIR}/python_sealog/db_import_utils.py aux_data ${DATA_DIR}/${cruise}/${lowering}/${auxdata_record}"
    exit 1
  fi

  echo " - Importing lowering record..."
  mongoimport --uri ${DB_URI} --db ${database} --collection lowerings --file ${lowering_mod_filepath} --jsonArray --mode upsert

  echo " - Importing lowering events"
  mongoimport --uri ${DB_URI} --db ${database} --collection events --file ${event_mod_filepath} --jsonArray --mode upsert

  echo " - Importing lowering aux data"
  mongoimport --uri ${DB_URI} --db ${database} --collection event_aux_data --file ${auxdata_mod_filepath} --jsonArray --mode upsert
}


# =========================== Start of Script =============================== #

# Confirm mongoimport is installed
if ! command -v mongoimport &> /dev/null; then
  echo "mongoimport is not installed."
  exit 0
fi

# Confirm DATA_DIR exists
if [ ! -d ${DATA_DIR} ]; then
  echo "ERROR: The local data directory: ${DATA_DIR} does not exist."
  exit 1
fi

# Get list of cruises
cruise_dirs=`find ${DATA_DIR} -maxdepth 1 -type d -name "$CRUISE_PATTERN"`

mod_cruise_dirs=""
for dir in $cruise_dirs; do
    mod_cruise_dirs="${mod_cruise_dirs} "`basename ${dir}`
done

# Prompt user to select cruise
echo "Which cruise (pick a number):"
select opt in ${mod_cruise_dirs} "Cancel"; do
    [[ -n $opt ]] && break || {
        echo "Which cruise?"
    }
done

if [ $opt == "Cancel" ];then
  exit 0
fi

cruise=$opt
echo ""


echo "Importing cruise events or lowering events?"
select opt in "Cruise" "Lowering" "Cancel"; do
    [[ -n $opt ]] && break || {
        echo "Which import type?"
    }
done

if [ $opt == "Cancel" ];then
  exit 0
fi

if [ $opt == "Cruise" ];then
  process_cruise $cruise ${CRUISE_DATABASE}
  exit 0
fi



# Get list of lowerings
lowering_dirs=`find "${DATA_DIR}/${cruise}" -maxdepth 1 -type d -name "${LOWERING_PATTERN//\{cruise\}/${cruise}}"`

mod_lowering_dirs=""
for dir in $lowering_dirs; do
    mod_lowering_dirs="${mod_lowering_dirs} "`basename ${dir}`
done

echo "Which lowering (pick a number):"
select opt in "All" ${mod_lowering_dirs} "Cancel"; do
    [[ -n $opt ]] && break || {
        echo "Which lowering?"
    }
done

if [ $opt == "Cancel" ];then
  exit 0
fi

if [ $opt == "All" ];then

  # Stress the potential dangers of continues and confirm the selection
  echo "You chose to import all the lowerings from cruise: ${cruise}."
  read -p "Do you want to proceed with the import (y/n)? " -n 1 -r
  if ! [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    exit 0
  fi

  lowerings=($mod_lowering_dirs)
else

  # Stress the potential dangers of continues and confirm the selection
  echo "You chose to import lowering ${opt} from cruise: ${cruise}."
  read -p "Do you want to proceed with the import (y/n)? " -n 1 -r
  if ! [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    exit 0
  fi

  lowerings=($opt)
fi

echo ""
echo ""

echo "Cruise: ${cruise}"
process_cruise_record ${cruise} ${LOWERING_DATABASE}

for lowering in "${lowerings[@]}"; do
  # Perform actions on each item
  process_lowering ${lowering} ${LOWERING_DATABASE}
done

exit 0

cd "${_D}"
