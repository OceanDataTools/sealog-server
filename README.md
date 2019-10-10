# sealog-server
Sealog event-logging server
Sealog is intended as a general purpose eventlogging framework that is independent of any particular user-interface.  All interactions with the Sealog Server are done via the [Sealog Server's RESTful API](<https://sealog-vehicle.oceandatatools.org:9200/sealog-server/documentation>).

This allows for users to develop their own user interfaces for adding, editing and exporting events or extend the functionality of other systems to dynamically submit events.  It's even possible to develop hardware-based clients (physical buttons) using cheap network-aware microcontrollers (i.e Ardinuo w/Ethernet Shield).

Almost all calls to the API are authenticated using Java Web Tokens (JWT).  The only exceptions are the requests related to self-registration of new users and requests to obtaining JWTs (using standard user/pass login creditionals).

### Short-list of features
 - 100% of functionality accessable via RESTful API, completely indenpendent of any graphical/CLI front-end.
 - Ad-hoc association of ancilary data with events such as sensor data, navigation, etc. 
 - Ability to filter events based on user, value, keywords and time spans
 - Ability to subscribe to the live eventlog feed (using websockets).
 - Simple exporting of all or a filtered list of events merged with ancilary data is JSON or CSV format
 - Defining event templates for quick event submission
 - role-based authentication using Java Web Tokens (JWT)

## API Documentation

Please refer to the [Sealog Server's RESTful API](<https://sealog-vehicle.oceandatatools.org:9200/sealog-server/documentation>)

## Installation

For Sealog Server installation instruction please look at [INSTALL.md](https://github.com/oceandatatools/sealog-server/blob/master/INSTALL.md).

### React/Redux front-end client

[sealog client for vehicles](https://github.com/oceandatatools/sealog-client-vehicle) is a react/redux-based web-client developed for use with sealog-server.

### Obtaining a JWT via the Command-line

Most of the API calls require a JWT to be included with the request header.  Here's how to obtain the JWT for a particular user from the command-line.  This example assumes cURL is installed.

From the terminal replaceing `<username>` and `<password>` with the appropriate information:
```
curl -H "Content-Type: application/json" -X POST -d '{"username":<username>,"password":<pasword>}' https://sealog-vehicle.oceandatatools.org:9200/sealog-server/login
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
curl -X POST --header 'Content-Type: application/json' --header 'Accept: application/json' --header 'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBjNDVkN2I0LTU4ODEtNGU2NC04ZmQzLTIwNTczMjVlMmFmZSIsInNjb3BlIjpbImV2ZW50X21hbmFnZXIiLCJldmVudF9sb2dnZXIiLCJldmVudF93YXRjaGVyIl0sImlhdCI6MTUwMDAzNTc1NX0.WoOLfXxCIxIZEswy1lsbjm7XxDcbfd_NuZsL2-NB_Qw' -d '{"event_value": "TEST"}' 'https://sealog-vehicle.oceandatatools.org:9200/sealog-server/api/v1/events'
```

This will respond with:
```
{
    "deleted":0,
    "errors":0,
    "insertedIds":["6ad467beb0f844c49dcc5078"],
    "inserted":1,
    "modified":0
}
```

The value associated with the variable `"insertedIds"` is the UID for the event.  Event UIDs are unique and can be used to directly access the event for the purposes of reading/editing/deleting.

Using this technique scripts can be developed to allow scripts, software or even hardware like Arduinos to submit events to the Sealog Server without the need to hard-code in usernames and passwords.

### Submitting an event using python

Submitting an event to sealog using python is very similar to the way it's done via the command-line.  First a JWT must be obtained, then the JWT is used to authenticate the event submission request.

```
import requests
import json

root_url = 'https://sealog-vehicle.oceandatatools.org:9200/sealog-server'
api_path = '/login'

payload = {
  "username": "guest",
  "password": ""
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

### Submitting an event using .NET

I don't do .NET.  It's nothing personnal, I just haven't had a need to use it and thus I have never learned it.  However the following codeblock should get a .NET developer fairly close to a working solution.  If someone reading this is a .NET developer can you please test this code block and provide some feedback?

```
Imports System  
Imports System.IO  
Imports System.Net  
Imports System.Text  
Namespace Examples.System.Net  
    Public Class WebRequestPostExample  

            Public Shared Sub Main()  
            Dim uriString As String
            uriString = "https://sealog-vehicle.oceandatatools.org:9200/sealog-server"

            Dim loginPath As String
            loginPath = "/login"

            Dim submitPath As String
            submitPath = "/api/v1/events"

            Dim loginPostParms As New Specialized.NameValueCollection
            loginPostParms.Add("username", "guest")
            loginPostParms.Add("password", "")

            Dim eventSubmitPostParams As New Specialized.NameValueCollection
            eventSubmitPostParams.Add("event_value", "HELLO_WORLD")

            ' Create a request using a URL that can receive a post.
            Dim request As WebRequest = WebRequest.Create(uriString + loginPath)  
            ' Set the Method property of the request to POST.  
            request.Method = "POST"  
            ' Create POST data and convert it to a byte array.  
            Dim postData As String = "username:testuser password:password"  
            Dim byteArray As Byte() = Encoding.UTF8.GetBytes(postData)  
            ' Set the ContentType property of the WebRequest.  
            request.ContentType = "application/form-data"  
            ' Set the ContentLength property of the WebRequest.  
            request.ContentLength = byteArray.Length  
            ' Get the request stream.  
            Dim dataStream As Stream = request.GetRequestStream()  
            ' Write the data to the request stream.  
            dataStream.Write(byteArray, 0, byteArray.Length)  
            ' Close the Stream object.  
            dataStream.Close()  
            ' Get the response.  
            Dim response As WebResponse = request.GetResponse()  
            ' Display the status.  
            Console.WriteLine(CType(response, HttpWebResponse).StatusDescription)  
            ' Get the stream containing content returned by the server.  
            dataStream = response.GetResponseStream()  
            ' Open the stream using a StreamReader for easy access.  
            Dim reader As New StreamReader(dataStream)  
            ' Read the content.  
            Dim responseFromServer As String = reader.ReadToEnd()  
            ' Display the content.  
            Console.WriteLine(responseFromServer)  
            ' Clean up the streams.  
            reader.Close()  
            dataStream.Close()  
            response.Close()  
        End Sub  
    End Class  
End Namespace
```

### Subscribing to the eventlog stream using python

The sealog server publishes updates to eventlog as a stream that can be subscribed to via websockets.  Because the server implements the pub/sub functionality using the [hapines websocket framework](https://github.com/hapijs/nes) there is some overhead that must be supported when trying to connect via the vanilla websockets libraries.

Please take a look at [this python script](https://github.com/oceandatatools/sealog-server/blob/master/misc/websocketsTest.py) for a quick-n-dirty example of how to connect to the eventlog stream from a python(v3.6) script.

## Want to Contribute?
My intention with sealog-server was to create a production quality eventlogging framework for any one to use... but I don't need to do this alone.  Any and all help is appreciated.  This include helping with the server code, fleshing out the documentation, creating some code examples, identifying bugs and making logical feature requests.  Please contact me at oceandatarat at gmail dot com if you want in on the action.

I've also setup a Slack channel for sealog, please contact me at oceandatarat at gmail dot com if you would like an invitation.

# Current Users
Sealog Server is currently used by the Woods Hole Oceanographic Institution to support science eventlogging for the JASON ROV and Alvin HOV.  Sealog is also used for shoreside event logging of the NOAA Ship Okeanos Explorer and E/V Nautilus

# Thanks and acknowledgments
Sealog is in ongoing development thanks to the generosity of the Schmidt Ocean Institute (SOI) who have supported the project since 2018. I also want to thank the Woods Hole Oceanographic Institution who provided the initial inspiration for the project and are slated to become it's first user.

Lastly I want to thank the UNOLS community who have helped me since the beginning by sharing their wealth of experience and technical ability.
