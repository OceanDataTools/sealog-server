## Sealog Server Overview

Sealog is a modular system for submitting, and extracting events and ancillary data associated with events.  Events and associated data are submitted to and extracted from the server via http GET/POST calls to the server's RESTful API.

Most of the API calls require an authentication token before the sealog-server will fulfill the request.  This authentication mechanism is in place to ensure event data is protected from accidental deletion/corruption.

All API calls and their requirements are available via the sealog-server Swagger.io web-interface at:
```
http://<sealog-server-ip>:8000/sealog-server/documentation/
```

In addition to the API, sealog-server exposes a websocket-based connection for receiving notification of new event submissions in real-time.  This functionality enable scripts, applications and other services to asynchronously respond to new events.  Examples of how this functionality can be leveraged includes: triggering frame captures for each/every new event, linking real-time position to events and pushing event-data to he surface/shore.

In addition to the sealog-server, most installations will include several additional services running either on the sealog server or other systems on the vessel.  These services are related to integrating with the 3rd party data systems such as frame capture systems, real-time vehicle navigation as well asthe auto-snapshot (ASNAP) service.

It is recommended that the sealog-server and all of the additional services be configured to start at boot using a process manager such as Supervisor: a system-wide process manager.  Supervisor provides a command-line-interface (sudo supervisorctl) and web-interface (`http://<server IP>:9001`) for viewing and controlling user-defined services and daemons.

### System Maintenance

The most likely maintenance required with regards to sealog-server or the ancillary services will be as a result of network changes to the sealog server machine.

In the event of a network change, the new ip address will need to be applied to all the ancillary services.  Network changes to the sealog-server machine should not affect any of the services that are also run from the sealog-server machine as these services should be connecting to the sealog-server via localhost (127.0.0.1).

In the event of an account change, a new authentication token will need to be applied to all the ancillary services.  This easiest way to obtain the new token is to log into the sealog-client as an admin user, click the account dropdown menu in the top navigation bar and select "Profile".  At the bottom of profile form will be a button to display the authentication token string.  The new token, will need to be applied to all services that communication with the Sealog API.

### ASNAP-specific:
The Automatic snapper (ASNAP) script triggers event creations at a set interval.  To change the interval simply update the "interval" variable in the sealog-asnap.py script.

### Sealog-Server Software changes
Below are details about how the "build" sealog-server should there be a need to change the code-base.

Sealog-server is written in nodeJS v8.11.x and the data is stored in MongoDB v3.4.x.  There is no compiling step with nodeJS services, simply make the changes and restart the service.  The sealog-server codebase includes mechanism for running the service in "development" mode.  This mode enables some additional debugging messages in the console stdout and also runs the services against a testing database.  The testing database is rebuilt each time the service is started in devel mode.  This allows the operated to modify the databased in any means necessary and then return to a known database state simply be restarting sealog-server.

To start the sealog-server in devel mode, from a terminal run the following:
```
cd ~/sealog-server/
npm run start-devel
```

To start the sealog-server in production mode, from a terminal run the following:
```
cd ~/sealog-server/
npm start
```
#### Installed Accounts
The sealog-server installation for Sealog includes 3 system accounts:
- admin --> admin account, password is "demo"
- pi    --> event-logging, cruise/lowering management account intended for use by the pi, password is empty
- guest --> event-logging account intended for use by anyone, password is empty

#### Obtaining a JWT

There are 3 ways to obtain a JWT:
1. Login to Sealog-Client as the user you want the JWT for then goto Profile. The JWT will be listed at the bottom of the profile form.
2. Login to Sealog-Client as an admin user then goto to System Maintenance --> Users. Click the "eye" icon next to the user you want the JWT for. This will open a modal containing the JWT for that user.
3. From the command line, make the following call, replacing `<username>` and `<password>` with the username and password for the disired account:

```
curl -X POST --header 'Content-Type: application/json' --header 'Accept: application/json' -d '{
  "username": <username>,
  "password": <password>
}' 'http://<sealog server IP>:8000/sealog-server/api/v1/login'
```
