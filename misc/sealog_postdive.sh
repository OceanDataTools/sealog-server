# This script in run from the Alvin c+c machine as user "alvin"
# You need to update the dive number variable to match the dive that just completed

# Dive number
dive_num="DXXXX"

# JWT authentication token
token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1NjIyMTYwfQ.v05UDVHDUgnFfyhucPdfrTGaSJJSVxQTJ-pDnRJPPbo'

# Root data folder for Sealog
data_folder="/data/sealog"

# Where the framegrabs are stored locally
framegrab_folder="/data/sealog/"${dive_num}"/framegrabs"

# Where to back up the data locally
backup_folder="/data/sealog/Backups"

echo "Turn off ASNAP"
curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "asnapStatus",
  "custom_var_value": "Off"
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810167212b348aed7fa9f5'

echo "Export event data"
curl -X GET --header 'Accept: application/json' --header 'authorization: '${token} --output ${data_folder}'/'${dive_num}'_eventOnlyExport.json' 'http://localhost:8000/sealog-server/api/v1/events'

echo "Export aux data"
curl -X GET --header 'Accept: application/json' --header 'authorization: '${token} --output ${data_folder}'/'${dive_num}'_auxDataExport.json' 'http://localhost:8000/sealog-server/api/v1/event_aux_data'

echo "Export data as json"
curl -X GET --header 'Accept: application/json' --header 'authorization: '${token} --output ${data_folder}'/'${dive_num}'_sealogExport.json' 'http://localhost:8000/sealog-server/api/v1/event_exports'

echo "Export data as csv"
curl -X GET --header 'Accept: application/json' --header 'authorization: '${token} --output ${data_folder}'/'${dive_num}'_sealogExport.csv' 'http://localhost:8000/sealog-server/api/v1/event_exports?format=csv'

echo "Moving data from " ${data_folder}" to " ${backup_folder}/${dive_num}
mkdir ${backup_folder}/${dive_num}
mv ${data_folder}/${dive_num}'_eventOnlyExport.json' ${backup_folder}/${dive_num}/
mv ${data_folder}/${dive_num}'_auxDataExport.json' ${backup_folder}/${dive_num}/
mv ${data_folder}/${dive_num}'_sealogExport.json' ${backup_folder}/${dive_num}/
mv ${data_folder}/${dive_num}'_sealogExport.csv' ${backup_folder}/${dive_num}/
mv ${data_folder}/framegrabs ${backup_folder}/${dive_num}/

echo "Recreating framegrab directory"
mkdir ${data_folder}/framegrabs
