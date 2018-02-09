# Installation Instructions

### Prerequisites

 - [MongoDB](https://www.mongodb.com)
 - [nodeJS](https://nodejs.org)
 - [npm](https://www.npmjs.com)
 - [git](https://git-scm.com)
 
#### Installing NodeJS/npm on Ubuntu 16.04LTS
The standard Ubuntu repositories for Ubuntu 16.04 only provide install packages for NodeJS v4.  Sealog-Server (and Sealog-Client) require nodeJS >= v8.7
 
To install nodeJS v8.7 on Ubuntu 16.04LTS run the following commands:
 ```
sudo apt-get install curl build-essential
cd ~
curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt-get install nodejs

 ```

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

### Start rethinkDB

From a terminal run:

```
rethinkdb
```

RethinkDB stores the database in the directory in whatever directory you're in when you run this command.  This is important when you want access to data already in a rethinkDB.

### Start the server in development mode

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

**This will start the server in production mode.**  This mode will connect to a rethinkdb database that was already setup for use with sealog-server.

- **TODO** Still need to write a stand-alone script for creating a default production database.

## Need to make everything available over port 80?

Sometimes on vessel networks it's only possible to access web-services using the standard network ports (i.e. 80, 443).  To use sealog server on these types of networks the API and websocket services will need to be tunnelled through port 80... luckily Apache makes this relatively easy.

### Prerequisites

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
