# Installation Instructions

### Prerequisites

 - [MongoDB](https://www.mongodb.com) >=v3.4.x
 - [nodeJS](https://nodejs.org) >=8.x.x
 - [npm](https://www.npmjs.com) >=5.7.x
 - [git](https://git-scm.com)
 
 
#### Installing MongoDB 3.4 on Ubuntu 16.04 LTS

Recommend using these instuctions up through part one:
https://www.digitalocean.com/community/tutorials/how-to-install-and-secure-mongodb-on-ubuntu-16-04
 
#### Installing NodeJS/npm on Ubuntu 16.04 LTS
Recommend using these instuctions, skipping the distro-version section and following the section on “How to install Using a PPA":
https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-16-04#how-to-install-using-a-ppa

### Clone the repository

```
git clone https://github.com/webbpinner/sealog-server.git
```

This should clone the repo to a directory called `sealog-server`

### Create a new configurations file

```
cd ./sealog-server
cp ./config/manifest.js.dist ./config/manifest.js
```

### Modify the configuration file

Set the `*_host`, `*_api_port`, `*_ws_port`, `*_prefix` values in the `./sealog-server/config/manifest.js` file to meet your specific installation requirements.

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

### Start the server in testing mode

From a terminal run:

```
cd ./sealog-server
npm run start-test
```

**This will start the server in testing mode.**  This means that the server is NOT in uber-verbose mode however a new clean database is created each time the server starts (i.e. any custom data from a previous run is blown away).

Running in testing mode will create an admin account (testadmin:password) and regular user account (testuser:password). 

### Start the server in production mode

From a terminal run:

```
cd ./sealog-server
npm start
```

**This will start the server in production mode.**  This mode will connect to a mongo database that was already setup for use with sealog-server.  If no database is found, sealog-server will attempt to create it.  In this case, sealog-server will create an administrator account (user:admin, pass:password)

## Need to make everything available over port 80?

Sometimes on vessel networks it's only possible to access web-services using the standard network ports (i.e. 80, 443).  To use sealog server on these types of networks the API and websocket services will need to be tunnelled through port 80... luckily Apache makes this relatively easy.

### Prerequisites

 - apache via `apt-get install apache2`
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
ProxyPass /ws ws://<serverIP>:8001/
ProxyPassReverse /ws ws://<serverIP>:8001/
```

You will need to reload Apache for the changes to take affect.
```
service apache2 restart
```

If everything went correctly you should not be able to access the sealog-server API at `http://<serverIP>/sealog-server/` and the sealog websocket service at `ws://<serverIP>/ws`
