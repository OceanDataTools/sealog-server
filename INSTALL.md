# Installation Instructions

### Prerequisites

 - [MongoDB](https://www.mongodb.com) >=v3.6.x
 - [nodeJS](https://nodejs.org) >=12.x
 - [npm](https://www.npmjs.com) >=6.13.x
 - [git](https://git-scm.com)
 
 
#### Installing MongoDB 3.6 on Ubuntu 18.04 LTS

```
sudo apt-get install mongodb
```
 
#### Installing NodeJS/npm on Ubuntu 18.04 LTS
Recommend using these instuctions, skipping the distro-version section and following the section on “How to install Using a PPA".  ***NOTE:*** tweak these instructions to install version 12:
https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-18-04

### Clone the repository

```
git clone https://github.com/OceanDataTools/sealog-server.git
```

This should clone the repo to a directory called `sealog-server`

### Create the new configurations files

```
cd ./sealog-server
cp ./config/db_constants.js.dist ./config/db_constants.js
cp ./config/email_constants.js.dist ./config/email_constants.js
cp ./config/manifest.js.dist ./config/manifest.js
cp ./config/path_constants.js.dist ./config/path_constants.js
cp ./config/secret.js.dist ./config/secret.js
```

### Modify the configuration files

Set the `host`, `port`, `wsPort`, and `prefix` values in the `./config/manifest.js` file to meet your specific installation requirements.  There are 3 sets of these variables for the various ways sealog-server can be run.  If you are only running one instance of Sealog Server on the server then the defaults are sufficient

Set the `sealogDB` and `sealogDB_devel` names in the `./config/db_constants.js` file to meet your specific installation requirements.  If you are only running one instance of Sealog Server on the server then the defaults are sufficient

Set the `IMAGE_PATH`, `CRUISE_PATH` and `LOWERING_PATH` locations in the `./config/path_constants.js` file to meet your specific installation requirements.  These paths are where the framegrabber image files, cruise files and lowering files are located on the server.

Set the `senderAddress`, `resetPasswordURL` locations in the `./config/email_constants.js` file to meet your specific installation requirements.  The `resetPasswordURL` most likely only needs to have 'localhost' replaced with the servers hostname/IP unless running a higly customized version of Sealog.

You will also need to uncomment the type of email integration used.  By default email is disabled but the distribution file includes commented code blocks for gmail and mailgun integration.

Create a secret JWT encryption key and save it to the `./config/secret.js` file.  Create the key by running the following command:
```
node -e "console.log(require('crypto').randomBytes(256).toString('base64'));"
```
Save the key between the single quotes in the `secrets.js` file
i.e. `module.exports = '<replace with secret key>'`

### Install the nodeJS modules

From a terminal run:
```
cd ./sealog-server
npm install
```

### Starting the sealog-server in development mode

From a terminal run:
```
cd ./sealog-server
npm run start-devel
```

**This will start the server in development mode.**  This means that the server is in uber-verbose mode and that a new clean database is created each time the server starts (i.e. any data added from a previous run is blown away).

Running in development mode will create an admin account (testadmin:password) and regular user account (testuser:password). 

### Starting the server in production mode

From a terminal run:

```
cd ./sealog-server
npm start
```

**This will start the server in production mode.**  This mode will connect to a mongo database that was already setup for use with sealog-server.  If no database is found, sealog-server will attempt to create it.  Running in production mode for the first time will create an admin account (admin:demo) and 1 regular user account (guest).  There is no password set for the regular account.

To recommended way to setup Sealog to run at boot is to used Supervisor.  To install Supervisor for Ubuntu type:

```
sudo apt-get install supervisor
```

Create a supervisor configuration file:
```
sudo pico /etc/supervisor/conf.d/sealog-server.conf
```

Copy/Paste the following into the file (assumes sealog-server is located in `/home/sealog` and that the desired user is `sealog`):
```
[program:sealog-server]
directory=/home/sealog/sealog-server
command=node server.js
environment=NODE_ENV="production"
process_name=sealog-server
redirect_stderr=true
stdout_logfile=/var/log/sealog-server_STDOUT.log
user=sealog
autostart=true
autorestart=true
```

Start the sealog-server supervisor task:
```
sudo supervisorctl start sealog-server:
```

## Need to make everything available over port 80?

Sometimes on vessel networks it's only possible to access web-services using the standard network ports (i.e. 80, 443).  To use sealog server on these types of networks the API and websocket services will need to be tunnelled through port 80... luckily Apache makes this relatively easy.

### Prerequisites

 - [apache](https://httpd.apache.org)
 - [mod_proxy](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html)
 - [mod_proxy_wstunnel](https://httpd.apache.org/docs/2.4/mod/mod_proxy_wstunnel.html)
 
 Make sure these modules have been enabled within Apache and that Apache has been restarted since the modules were enabled.
 
 ### Update the Apache site configuration
 
 Add the following code block to the apache site configuration (on Ubuntu this is located at: `/etc/apache2/sites-available/000-default.conf`)
 
```
ProxyPreserveHost On
ProxyRequests Off
ServerName <serverIP>
ProxyPass /sealog-server/ http://<serverIP>:8000/sealog-server/
ProxyPassReverse /sealog-server/ http://<serverIP>:8000/sealog-server/
ProxyPass /ws ws://<serverIP>:8000/
ProxyPassReverse /ws ws://<serverIP>:8000/
```

You will need to reload Apache for the changes to take affect.
```
service apache2 restart
```

If everything went correctly you should not be able to access the sealog-server API at `http://<serverIP>:8000/sealog-server/` and the sealog websocket service at `ws://<serverIP>:8000/ws`

## Need to make everything available over port https?

By default sealog-server runs over http.  To run the server over https uncomment the following commented lines at the top of the `./config/manifest.js` file and replace `<privKey.pem>` and `<fullchain.pem>` with the appropriate cert files:

```
// const Fs = require('fs')

// const tlsOptions = {
//   key: Fs.readFileSync(<privKey.pem>),
//   cert: Fs.readFileSync(<fullchain.pem>)
// };
```

AND the following line at line 45:
```
//    tls: tlsOptions,
```

**Note:** Make sure the user running the sealog-server process has read access to the certificate files.

# Enabling Additional Functionality

Although Sealog-Server is written in NodeJS, many of the additional functionality is written in Python3 (v3.6+).  These additional features are completely optional and do not have to be configured to install and run Sealog but greatly add to the overall usefulness of the platform.

## Prerequisites
It is recommended to setup a python virtual environment within the sealog-server root directory from which to run the python scripts.

Install the required packages:
```
sudo apt-get install python3 python3-dev python3-pip python3-venv
```

Goto the sealog-server installation directory and create the python virtual environment.
```
cd ~/sealog-server
python3 -m venv ./venv
```

Activate the python virtual environment and install the requried python libraries
```
source ./venv/bin/activate
pip install pymongo websockets requests
```

## Automatic Snapshot (ASNAP)

Automatic snapshots or ASNAP is a service that when enabled will submit an ASNAP event to the sealog-server at a specifed interval.  The ASNAP service is useful for ensuring there is a minimum resolution of events during a cruise or lowering.  Without ASNAP there could be huge periods of a cruise or lowering where there is no information about the vessel or vehicle.

### Configuring the ASNAP service:
```
cp ~/sealog-server/misc/sealog_asnap.py.dist ~/sealog-server/misc/sealog_asnap.py
```

Edit the supervisor configuration file:
```
sudo pico /etc/supervisor/conf.d/sealog-server.conf
```

Append the following to the supervisor configuration file (assumes sealog-server is located in `/home/sealog` and that the desired user is `sealog`):
```
[program:sealog-asnap]
directory=/home/sealog/sealog-server/misc
command=/home/sealog/sealog-server/venv/bin/python sealog_asnap.py
process_name=sealog-asnap
redirect_stderr=true
stdout_logfile=/var/log/sealog-asnap_STDOUT.log
user=sealog
autostart=true
autorestart=true
stopsignal=QUIT
```

The default ASNAP interval is 10 seconds.  To change that add the `--interval <seconds>` argument to the command statement. i.e.

```
command=/home/sealog/sealog-server/venv/bin/python sealog_asnap.py --interval 300
```


## Auto-Actions

Auto-Actions is a service that triggered additional actions based on submitted events.  This can include setting lowering milestones in real-time via events, turning on/off the ASNAP service or really anything that can be initiated using python.  The sealog-server repository includes a boilerplate auto-actions script that is useful to users of the sealog-client-vehicle project.  In it's default behavior this script will enable/disable the ASNAP server when it detects a "Descending"/"On Surface" events.  It will also update the lowering start/stop times and lowering milestones based on the corresponding events.

### Configuring the Auto-Actions service:
```
cp ~/sealog-server/misc/sealog_auto_actions.py.dist ~/sealog-server/misc/sealog_auto_actions.py
```

Edit the supervisor configuration file:
```
sudo pico /etc/supervisor/conf.d/sealog-server.conf
```

Append the following to the supervisor configuration file (assumes sealog-server is located in `/home/sealog` and that the desired user is `sealog`):
```
[program:sealog-auto-actions]
directory=/home/sealog/sealog-server/misc
command=/home/sealog/sealog-server/venv/bin/python sealog_auto_actions.py
process_name=sealog-auto-actions
redirect_stderr=true
stdout_logfile=/var/log/sealog-auto-actions_STDOUT.log
user=sealog
autostart=true
autorestart=true
stopsignal=QUIT
```

## Post-Lowering and Post-Cruise Data Exports

One of the first things operators will want to do after they install Sealog is figure out how to get data out of it an into files they can give to their customers.  The sealog-server repository includes 2 files to help with the data export process.  The `sealog_vehicle_data_export.py` file is for exporting sealog data from vehicle-focused installations.  The `sealog_vessel_data_export.py` file is for exporting sealog data from vessel-focused installations.

### Configuring the data export script:

First the appropriate boilerplate file needs to be enabled.

```
cp ~/sealog-server/misc/sealog_vehicle_data_export.py.dist ~/sealog-server/misc/sealog_data_export.py
```
or
```
cp ~/sealog-server/misc/sealog_vessel_data_export.py.dist ~/sealog-server/misc/sealog_data_export.py
```

Next the `sealog_data_export.py` file needs to be customized for the actual installation.  Open the file and change the following variables to match the desired behavior.

Sealog for Vehicles:
```
EXPORT_ROOT_DIR = '/home/sealog/sealog-export'
VEHICLE_NAME = 'Explorer'
```

Sealog for Vessels:
```
EXPORT_ROOT_DIR = '/home/sealog/sealog-export'
VESSEL_NAME = 'Discoverer'
```




