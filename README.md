# sealog-server
Sealog event logging server

Sealog is intended as a general purpose eventlogging framework that is independent of any particular user-interface.  All interactions with the Sealog Server are done via the [Sealog Server's RESTful API](<http://162.243.201.175/sealog-server/documentation>).

This allows for users to develop their own user interfaces for adding, editing and exporting events or extend the functionality of other systems to dynamically submit events.  It's even possible to develop hardware-based clients (physical buttons) using cheap network-aware microcontrollers (i.e Ardinuo w/Ethernet Shield).

Almost all calls to the API are authenticated using Java Web Tokens (JWT).  The only exceptions are the requests related to self-registration of new users and requests to obtaining JWTs (using standard user/pass login creditionals).

### Short-list of features
 - 100% of functionality accessable via RESTful API, completely indenpendent of any graphical/CLI front-end.
 - Ad-hoc association of ancilary data with events such as sensor data, navigation, etc. 
 - Ability to filter events based on user, value, keywords and time spans
 - Ability to subscribe to the live eventlog feed (using websockets).
 - Simple exporting of all or a filtered list of events merged with ancilary data
 - Defining event templates for quick event submission
 - role-based authentication using Java Web Tokens (JWT)

## API Documentation

Please refer to the [Sealog Server's RESTful API](<http://162.243.201.175/sealog-server/documentation>)

## Installation

For Sealog Server installation instruction please look at [INSTALL.md](https://github.com/webbpinner/sealog-server/blob/master/INSTALL.md).

## Examples

### React/Redux front-end client

[sealog client](https://github.com/webbpinner/sealog-client) is a react/redux-based web-client developed for use with sealogserver.

### Obtaining a JWT via the Command-line

Most of the API calls require a JWT to be included with the request header.  Here's how to obtain the JWT for a particular user from the command-line.  This example assumes cURL is installed.

From the terminal:
```
curl -H "Content-Type: application/json" -X POST -d '{"username":"testadmin","password":"password"}' http://162.243.175.201/sealog-server/login
```

This will respond with:
```
{
    "token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBjNDVkN2I0LTU4ODEtNGU2NC04ZmQzLTIwNTczMjVlMmFmZSIsInNjb3BlIjpbImV2ZW50X21hbmFnZXIiLCJldmVudF9sb2dnZXIiLCJldmVudF93YXRjaGVyIl0sImlhdCI6MTUwMDAzNTc1NX0.WoOLfXxCIxIZEswy1lsbjm7XxDcbfd_NuZsL2-NB_Qw",
    "id":"0a44ce1a-2cb9-11e6-b67b-9e71128cae77"
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
curl -X POST --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBjNDVkN2I0LTU4ODEtNGU2NC04ZmQzLTIwNTczMjVlMmFmZSIsInNjb3BlIjpbImV2ZW50X21hbmFnZXIiLCJldmVudF9sb2dnZXIiLCJldmVudF93YXRjaGVyIl0sImlhdCI6MTUwMDAzNTc1NX0.WoOLfXxCIxIZEswy1lsbjm7XxDcbfd_NuZsL2-NB_Qw' -d '{"event_value": "TEST"}' 'http://162.243.201.175/sealog-server/api/v1/events'
```

This will respond with:
```
{
    "deleted":0,
    "errors":0,
    "generated_keys":["6ad467be-b0f8-44c4-9dcc-5078e0423b03"],
    "inserted":1,
    "replaced":0,
    "skipped":0,
    "unchanged":0
}
```

The value associated with the variable `"generated_keys"` is the UUID for the event.  Event UUIDs are unique and can be used to directly access the event for the purposes of reading/editing/deleting.

Using this technique scripts can be developed to allow scripts, software or even hardware like Arduinos to submit events to the Sealog Server without the need to hard-code in usernames and passwords.

### Submitting an event using python

Submitting an event to sealog using python is very similar to the way it's done via the command-line.  First a JWT must be obtained, then the JWT is used to authenticate the event submission request.

```
import requests
import json

root_url = 'http://162.243.201.175/sealog-server'
api_path = '/login'

payload = {
  "username": "testuser",
  "password": "password"
}

r = requests.post(root_url + api_path, data=payload)

token = json.loads(r.text)['token']

api_path = '/api/v1/events'
headers = {'authorization': token}

payload = {
  "event_value": "HELLO_WORLD"
}

r = requests.post(root_url + api_path, headers=headers, data=payload)
```

The JWT string (`token`) remains constant for a user as long as the roles for that user do not change. If a user's roles are changed or a user is deleted, the server will reject the JWT.  Therefore scripts only need to include a valid JWT string (`token`) and not the username/password to authenticate API requests to the server.

### Subscribing to the eventlog stream using python

The sealog server publishes updates to eventlog as a stream that can be subscribed to via websockets.  Because the server implements the pub/sub functionality using the [hapines websocket framework](https://github.com/hapijs/nes) there is some overhead that must be supported when trying to connect via the vanilla websockets libraries.

Please take a look at [this python script](https://github.com/webbpinner/sealog-server/blob/master/misc/websocketsTest.py) for a quick-n-dirty example of how to connect to the eventlog stream from a python(v3.5) script.

## Want to Contribute?
My intention with sealog-server was to create a production quality eventlogging framework for any one to use... but I don't need to do this alone.  Any and all help is appreciated.  This include helping with the server code, fleshing out the documantation, creating some code examples, identifying bugs and making logical feature requests.  Please contact me at oceandatarat at gmail dot com if you want in on the action.

I've also setup a Slack channel for sealog, please contact me at oceandatarat at gmail dot com if you would like to join the channel.

