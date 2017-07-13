# Installation Instructions

### Prerequisites

 - [rethinkDB](https://www.rethinkdb.com)
 - [nodeJS](https://nodejs.org)
 - [npm](https://www.npmjs.com)
 - [git](https://git-scm.com)

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

Set the `*_host`, `*_api_port` and `*_ws_port` values in the `./sealog-server/config/manifest.js` file to meet your specific installation requirements.

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

RethinkDB stores the database in the directory in whatever directory you're in when you run this command.  This is important when you don't what access data already in a rethinkDB.

### Start the server in development mode

From a terminal run:

```
cd ./sealog-server
npm run start-devel
```

**This will start the server in development mode.**  This means that the server is in uber-verbose mode and that a new clean database is created each time the server starts (i.e. any custom data from a previous run is blown away).

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

**This will start the server in production mode.**  This mode will connect to a rethinkdb database that was already setup for use with sealog.

- **TODO** Still need to write a script for creating up a default production database.

