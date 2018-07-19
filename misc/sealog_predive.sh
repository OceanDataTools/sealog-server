#!/bin/bash
## This is run from the Alvin c+c machine (199.92.162.100)

# JWT authentication token
token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTI1NjIyMTYwfQ.v05UDVHDUgnFfyhucPdfrTGaSJJSVxQTJ-pDnRJPPbo"

# Root folder where the data is stored
data_folder="/data/sealog"

echo "Turn off ASNAP"
curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "asnapStatus",
  "custom_var_value": "Off"
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810167212b348aed7fa9f5'

echo "Wipe local database"
curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "pilot",
  "custom_var_value": ""
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810166212b348aed7fa9f5'

curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "observers",
  "custom_var_value": ""
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810165212b348aed7fa9f5'

curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "location",
  "custom_var_value": ""
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810164212b348aed7fa9f5'

curl -X PATCH --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'authorization: '${token} -d '{
  "custom_var_name": "summary",
  "custom_var_value": ""
}' 'http://localhost:8000/sealog-server/api/v1/custom_vars/59810163212b348aed7fa9f5'

curl -X DELETE --header 'Accept: application/json' --header 'authorization: '${token} 'http://localhost:8000/sealog-server/api/v1/events/all'

echo "Remove any junk framegrabs collected since the end of the last dive"
rm -r ${data_folder}"/framegrabs"
mkdir ${data_folder}"/framegrabs"
