# Installation Instructions

### Prerequisites

 - [MongoDB](https://www.mongodb.com) >=v3.4.x
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
git clone https://github.com/webbpinner/sealog-server.git
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

Set the `emailAddress`, `emailPassword`, `resetPasswordURL` locations in the `./config/email_constants.js` file to meet your specific installation requirements.  The `emailAddress` and `emailPassword` are the email/password for the email address used when sending emails to users.  Currently this must be a gmail-based email account. The `resetPasswordURL` most likely will not need to be changed unless running a higly customized version of Sealog.

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

### Start the server in production mode

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
process_name=sealog-server_%(process_num)s
numprocs=1
redirect_stderr=true
stdout_logfile=/var/log/sealog-server_STDOUT.log
stderr_logfile=/var/log/sealog-server_STDERR.log
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