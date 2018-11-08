#!/bin/bash
# This script in run from the sealog server as user "jason"

SERVER_IP="0.0.0.0"
SERVER_PORT="8000"
SERVER_ROOT="sealog-server"

# JWT authentication token
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1NjIyMTYwfQ.v05UDVHDUgnFfyhucPdfrTGaSJJSVxQTJ-pDnRJPPbo'

GET_LOWERING_UID_SCRIPT='python3 /home/jason/sealog-server-jason/misc/getLoweringId.py'
GET_CRUISE_UID_SCRIPT='python3 /home/jason/sealog-server-jason/misc/getCruiseId.py'
GET_FRAMEGRAB_SCRIPT='python3 /home/jason/sealog-server-jason/misc/getFramegrabList.py'
GET_SULIUSCAM_SCRIPT='python3 /home/jason/sealog-server-jason/misc/getSuliusCamList.py'

# Root data folder for Sealog
BACKUP_DIR_ROOT="/home/jason/sealog-backup"
SEALOG_IMAGES_DIR="home/jason/sealog-images"
FRAMEGRAB_DIR="framegrabs"
SULIUSCAM_DIR="SuliusCam"
CRUISE_ID=""
CRUISE_UID=""
LOWERING_ID=""
LOWERING_UID=""

getLoweringData(){
	echo "LOWERING_UID = ${LOWERING_UID}"

	echo "Export lowering record"
	curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${LOWERING_DIR}'/'${LOWERING_ID}'_loweringRecord.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/lowerings/'${LOWERING_UID}

	echo "Exporting event data"
	curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${LOWERING_DIR}'/'${LOWERING_ID}'_eventOnlyExport.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/events/bylowering/'${LOWERING_UID}

	echo "Exporting aux data"
	curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${LOWERING_DIR}'/'${LOWERING_ID}'_auxDataExport.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/event_aux_data/bylowering/'${LOWERING_UID}

	echo "Exporting events with aux data as json"
	#curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${LOWERING_DIR}'/'${LOWERING_ID}'_sealogExport.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/event_exports/bylowering/'${LOWERING_UID}

	echo "Exporting event with aux data as csv"
	#curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${LOWERING_DIR}'/'${LOWERING_ID}'_sealogExport.csv' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/event_exports/bylowering/'${LOWERING_UID}'?format=csv'
}

getFramegrabs(){
	${GET_FRAMEGRAB_SCRIPT} ${LOWERING_DIR}'/'${LOWERING_ID}'_auxDataExport.json'
}

getSuliusCam(){
	${GET_SULIUSCAM_SCRIPT} ${LOWERING_DIR}'/'${LOWERING_ID}'_eventOnlyExport.json'
}

usage(){
cat <<EOF
Usage: $0 [-?] [-d dest_dir] [-c cruise_id] <lowering_id>
	-d <dest_dir>   Where to store the backup, the default is:
	                ${BACKUP_DIR_ROOT}
	-c <cruise_id>  The cruise id for the lowering, if specified
	                the lowering backup will be stored within a 
	                <cruise_id> directory. 
	-?              Print this statement.
	<lowering_id>   The dive ID i.e. 'J2-1107'
EOF
}

while getopts ":d:c:" opt; do
  case $opt in
   d)
      # echo ${OPTARG}
      BACKUP_DIR_ROOT=${OPTARG}
      ;;
   c)
      CRUISE_ID="${OPTARG}"
      ;;

   \?)
      usage
      exit 0
      ;;
  esac
done

shift $((OPTIND-1))

if [ $# -ne 1 ]; then
        echo ""
        echo "Missing dive number"
        echo ""
        usage
        exit 1
fi

LOWERING_ID="${1}"

# echo "LOWERING ID SCRIPT:" ${GET_LOWERING_UID_SCRIPT} ${1}
if [ ${CRUISE_ID} != "" ]; then
	CRUISE_UID=`${GET_CRUISE_UID_SCRIPT} ${CRUISE_ID}`

	if [ -z ${CRUISE_UID} ]; then
		echo ""
		echo "Unable to find cruise data for cruise id: ${CRUISE_ID}"
		echo ""
		exit 1
	fi

	echo "CRUISE_UID:" ${CRUISE_UID}

fi

LOWERING_UID=`${GET_LOWERING_UID_SCRIPT} ${1}`
if [ -z ${LOWERING_UID} ]; then
	echo ""
	echo "Unable to find lowering data for dive id: ${1}"
	echo ""
	exit 1
fi
echo "LOWERING_UID:" ${LOWERING_UID}

echo ""
echo "-----------------------------------------------------"
echo "Backup Directory:" ${BACKUP_DIR_ROOT}
echo "-----------------------------------------------------"
read -p "Continue? (Y/N): " confirm && [[ $confirm == [Yy] || $confirm == [Yy][Ee][Ss] ]] || exit 1

if [ ! -z ${CRUISE_ID} ]; then
	BACKUP_DIR=${BACKUP_DIR_ROOT}/${CRUISE_ID}
else
	BACKUP_DIR=${BACKUP_DIR_ROOT}
fi

LOWERING_DIR=${BACKUP_DIR}/${LOWERING_ID}

if [ ! -d ${LOWERING_DIR} ]; then
    read -p "Create backup directory? (Y/N): " confirm && [[ $confirm == [Yy] || $confirm == [Yy][Ee][Ss] ]] || exit 1
    mkdir -p ${LOWERING_DIR}
    if [ ! -d ${LOWERING_DIR} ]; then
            echo "Unable to create backup directory... quitting"
            exit 1
    fi
    mkdir ${LOWERING_DIR}/${FRAMEGRAB_DIR}
    if [ ! -d ${LOWERING_DIR}/${FRAMEGRAB_DIR} ]; then
            echo "Unable to create framegrab directory... quitting"
            exit 1
    fi
    mkdir ${LOWERING_DIR}/${SULIUSCAM_DIR}
    if [ ! -d ${LOWERING_DIR}/${SULIUSCAM_DIR} ]; then
            echo "Unable to create SuliusCam directory... quitting"
            exit 1
    fi
fi

if [ ${CRUISE_UID} != '' ]; then
	echo "Export cruise record"
	curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${BACKUP_DIR}'/'${CRUISE_ID}'_cruiseRecord.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/cruises/'${CRUISE_UID}

	echo "Export event templates"
	curl -X GET --header 'Accept: application/json' --header 'authorization: '${TOKEN} --output ${BACKUP_DIR}'/'${CRUISE_ID}'_eventTemplates.json' 'http://'${SERVER_IP}':'${SERVER_PORT}'/'${SERVER_ROOT}'/api/v1/event_templates'
fi

getLoweringData

getFramegrabs | awk -v dest=${LOWERING_DIR}/${FRAMEGRAB_DIR} 'BEGIN{print "#!/bin/bash"} {printf "cp -v %s %s/\n", $0, dest}' > ${LOWERING_DIR}/framegrabCopyScript.sh
pico ${LOWERING_DIR}/framegrabCopyScript.sh
read -p "Proceed with copying framegrabs? (Y/N): " confirm && [[ $confirm == [Yy] || $confirm == [Yy][Ee][Ss] ]] || exit 1
echo "Copying framegrabs"
chmod +x ${LOWERING_DIR}/framegrabCopyScript.sh
${LOWERING_DIR}/framegrabCopyScript.sh

getSuliusCam | awk -v dest=${LOWERING_DIR}/${SULIUSCAM_DIR} 'BEGIN{print "#!/bin/bash"} {printf "cp -v %s %s/\n", $0, dest}' > ${LOWERING_DIR}/suliusCamCopyScript.sh
pico ${LOWERING_DIR}/suliusCamCopyScript.sh
read -p "Proceed with copying SuliusCam images? (Y/N): " confirm && [[ $confirm == [Yy] || $confirm == [Yy][Ee][Ss] ]] || exit 1
echo "Copying SuliusCam images"
chmod +x ${LOWERING_DIR}/suliusCamCopyScript.sh
${LOWERING_DIR}/suliusCamCopyScript.sh

echo "Done!"
