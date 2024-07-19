# sealog-server
Sealog event-logging server
Sealog is intended as a general purpose eventlogging framework that is independent of any particular user-interface.  All interactions with the Sealog Server are done via the [Sealog Server's RESTful API](<https://sealog-vehicle.oceandatatools.org:9200/sealog-server/documentation>).

This allows for users to develop their own user interfaces for adding, editing and exporting events or extend the functionality of other systems to dynamically submit events.  It's even possible to develop hardware-based clients (physical buttons) using cheap network-aware microcontrollers (i.e Ardinuo w/Ethernet Shield) or commerical products (StreamDeck).

Almost all calls to the API are authenticated using Java Web Tokens (JWT).  The only exceptions are the requests related to self-registration of new users and requests to obtaining JWTs (using standard user/pass login creditionals).

### Short-list of features
 - 100% of functionality accessable via RESTful API, completely indenpendent of any graphical/CLI front-end.
 - Ad-hoc association of ancilary data with events such as sensor data, navigation, etc. 
 - Ability to filter events based on user, value, keywords and time spans
 - Ability to subscribe to the live eventlog feed (using websockets).
 - Simple exporting of all or a filtered list of events merged with ancilary data is JSON or CSV format
 - Defining event templates for quick event submission
 - role-based authentication using Java Web Tokens (JWT)
 
### Architecture
The core concept behind the sealog architecture is that the server's functionality remain small and concise.  The sealog-server is simply an API that other programs, scripts and application can leverage to submit and retrieve event data.  Data can be retrieved as needed via the RESTful API or clients can be notificed of changes asynchronously by connecting to the server via websockets and subscribing to one of the many subscription channels.

![Architecture](/docs/sealog-architecture.svg)

## API Documentation

Please refer to the [Sealog Server's RESTful API](<https://sealog-vehicle.oceandatatools.org:9200/sealog-server/documentation>)

![Sealog Server's RESTful API](/docs/sealog-swagger-screenshot.png)

## Installation

For Sealog Server installation instruction please look at [INSTALL.md](https://github.com/oceandatatools/sealog-server/blob/master/INSTALL.md).

### React/Redux front-end client

[sealog client for vehicles](https://github.com/oceandatatools/sealog-client-vehicle) is a react/redux-based web-client developed for use with sealog-server focused on supporting event-logging for underwater vehicles.
[sealog client for vessels](https://github.com/oceandatatools/sealog-client-vessel) is another react/redux-based web-client developed for use with sealog-server focused on supporting cruise-level event-logging for for research vessels.

### Obtaining a JWT via the Command-line

Most of the API calls require a JWT to be included with the request header.  Here's how to obtain the JWT for a particular user from the command-line.  This example assumes cURL is installed.

From the terminal replaceing `<username>` and `<password>` with the appropriate information:
```
curl -H "Content-Type: application/json" -X POST -d '{"username":<username>,"password":<pasword>}' https://sealog-vehicle.oceandatatools.org:9200/sealog-server/api/v1/auth/login
```

This will respond with:
```
{
    "token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBjNDVkN2I0LTU4ODEtNGU2NC04ZmQzLTIwNTczMjVlMmFmZSIsInNjb3BlIjpbImV2ZW50X21hbmFnZXIiLCJldmVudF9sb2dnZXIiLCJldmVudF93YXRjaGVyIl0sImlhdCI6MTUwMDAzNTc1NX0.WoOLfXxCIxIZEswy1lsbjm7XxDcbfd_NuZsL2-NB_Qw",
    "id":"6ad467beb0f844c49dcc5078"
}
```

The value associated with the variable `"token"` is the JWT  Include this JWT in subsequent request to the API to interact with the Sealog Server.

**NOTES:**

- Sealog Server uses role-based permissions to limit what API calls a user can successfully make.  If an API request is made using a JWT who's associated user does not have permission to make the request the Sealog Server will respond with a status code of 400 (not authorized).

- A new JWT must be requested anytime the role permissions associated with an account are altered.

### Submitting an event to Sealog Server via the Command-line

Submitting an event to the Sealog Server requires a JWT who's associated user includes the role of 'event_logger'.  Please refer to the previous section for instructions on obtaining the JWT for a particular user.  Here's how to submit an event to the Sealog Server from the command-line.  This example assumes cURL is installed.

From the terminal:
```
curl -X POST --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBjNDVkN2I0LTU4ODEtNGU2NC04ZmQzLTIwNTczMjVlMmFmZSIsInNjb3BlIjpbImV2ZW50X21hbmFnZXIiLCJldmVudF9sb2dnZXIiLCJldmVudF93YXRjaGVyIl0sImlhdCI6MTUwMDAzNTc1NX0.WoOLfXxCIxIZEswy1lsbjm7XxDcbfd_NuZsL2-NB_Qw' -d '{"event_value": "TEST"}' 'https://sealog-vehicle.oceandatatools.org:9200/sealog-server/api/v1/events'
```

This will respond with:
```
{
    "acknowledged": "true",
    "insertedId":"6ad467beb0f844c49dcc5078" 
}
```

The value associated with the variable `"insertedId"` is the UID for the event.  Event UIDs are unique and can be used to directly access the event for the purposes of reading/editing/deleting.

Using this technique scripts can be developed to allow scripts, software or even hardware like Arduinos to submit events to the Sealog Server without the need to hard-code in usernames and passwords.

### Submitting an event using python

Submitting an event to sealog using python is very similar to the way it's done via the command-line.  First a JWT must be obtained, then the JWT is used to authenticate the event submission request.

```
import requests
import json

root_url = 'https://sealog-vehicle.oceandatatools.org:9200/sealog-server'
api_path = '/api/v1/auth/login'

payload = {
  "username": "guest",
  "password": ""
}

r = requests.post(root_url + api_path, data=payload)

token = json.loads(r.text)['token']

api_path = '/api/v1/events'
headers = {'Authorization': 'Bearer ' + token}

payload = {
  "event_value": "HELLO_WORLD"
}

r = requests.post(root_url + api_path, headers=headers, data=payload)
```

The JWT string (`token`) remains constant for a user as long as the roles for that user do not change. If a user's roles are changed or a user is deleted, the server will reject the JWT.  Therefore scripts only need to include a valid JWT string (`token`) and not the username/password to authenticate API requests to the server.

### Subscribing to the eventlog stream using python

The sealog server publishes updates to eventlog as a stream that can be subscribed to via websockets.  Because the server implements the pub/sub functionality using the [hapines websocket framework](https://github.com/hapijs/nes) there is some overhead that must be supported when trying to connect via the vanilla websockets libraries.

Please take a look at [this python script](https://github.com/oceandatatools/sealog-server/blob/master/misc/websockets_test.py) for a quick-n-dirty example of how to connect to the eventlog stream from a python(v3.6+) script.

## Want to Contribute?
My intention with sealog-server was to create a production quality event logging framework for any one to use... but I don't need to do this alone.  Any and all help is appreciated.  This include helping with the server code, fleshing out the documentation, creating some code examples, identifying bugs and making logical feature requests.  Please contact me at oceandatarat at gmail dot com if you want in on the action.

I've also setup a Slack channel for sealog, please contact me at oceandatarat at gmail dot com if you would like an invitation.

# Current Users
- ROV Jason and HOV Alvin operated by Woods Hole Oceanographic Institution
- University of Rhode Island's Inner Space Center in support of the NOAA Ship Okeanos Explorer and E/V Nautilus
- R/V Falkor and ROV Subastian operated by the Schmidt Ocean Institute
- R/V OceanXplorer1, ROV Chimaera, HOV Nadir and HOV Neptune operated by OceanX
- E/V Nautilus, ROV Hercules/Argus, operated by Ocean Exploration Trust
- ROV Lu'ukai operated by University of Hawaii

# Thanks and acknowledgments
Sealog exists thanks to financial support from it's users and continues to evolve thanks to the UNOLS community who have helped me since the beginning by sharing their wealth of experience and technical knowledge.
