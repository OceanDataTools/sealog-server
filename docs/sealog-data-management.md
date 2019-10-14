### Sealog Server Data Management
Author: Webb Pinner, webbpinner@gmail.com
Written: May 2, 2018
Updated: October 08, 2019

#### PRE-CRUISE

##### Setup a New cruise
1. Login to the Sealog web-interface as an admin user
2. Navigate to System Management --> Cruises
3. Click the "Add Cruise" button.
4. Complete the form.  Red asterisks designates the required fields.
5. Click the "Create" button

##### Hide the previous cruise (optional)
This prevents the current science party from seeing the lowerings from the previous cruise.  If it's a multi-leg cruise and/or the science party wants to review lowerings from the previous cruise then this step may be omitted.
1. Log into the Sealog web-interface as an admin user
2. Navigate to System Management --> Cruises
3. Click the "eye" icon next to the cruise you wish to hide. Hidden cruises will have an eye icon with a diagonal slash through it.

#### PRE-DIVE

##### Verify the ASNAP service is working correctly
1. Login to sealog client as guest
2. Click the "Show ASNAP" button in the upper-right of the Event History window.
3. Look at the ASNAP status in the lowering-left of the UI
4. If the ASNAP service is "Off"
  - Use the top navbar and select System Maintenance --> Toggle ASNAP. This should change the status to "On"
  - Click "SeaLog" in the upper-left of the UI to return to the main window
5. Wait upto 10 seconds and look for new "ASNAP" events to appear in the event history window.
6. If events do not appear then try the following:
  - Goto `http://<server_ip>:9001`
  - Click the "Restart" link next to "sealog-asnap"

##### Create the new lowering:
1. Login to sealog client an admin user
2. Goto System Management --> Lowerings
3. Complete the "Create New Lowering" form
  - Since the end date/time is unknown simple set it to the current date/time plus 1 day. These times will need to be updated later.

#### DURING THE DIVE
1. Users makes events ad-hoc
2. Autosnap makes an event every 10 seconds

#### POST-DIVE

##### Disable Auto-snap in sealog if needed
1. Login to sealog client as an admin user.
2. If the ASNAP status in the client footer reads "On":
  - Use the top navbar to select System Maintenance --> Toggle ASNAP Status. This should toggle the message in the footer from "On" to "Off"

##### Update the start/stop times for the lowering.
1. Login to the Sealog web-interface as an admin user
2. From the top navigation bar, goto System-Management->Lowerings
3. Click the blue pencil icon next to the recently completed lowering in the list of lowerings
4. Click the Orange "Milestones/stats" button
5. Use the graphical interface to set the start/stop times and the on/off bottom times
6. Click the "Update" button to save the changes

#### POST LAST DIVE OF THE CRUISE

##### Export the data from all of the lowerings for the current cruise
1. Login to the Sealog web-interface as an admin user
2. Click the "Review Cruises/Lowerings" link in the top bar navigation
3. Select the current cruise from the list of cruises
4. Make note of the lowerings that have occured during the current cruise
5. Open a terminal window.
6. SSH into the sealog-server machine as the user that runs sealog-server and run the following commands replacing `<cruise_id>` with the current cruise id (i.e AT42-01):
  ```
  cd to ~/sealog-server/misc
  ./sealog-postcruise.sh <cruise_id>
  ```
  This script will run the `./sealog-postdive.sh -c <cruise_id> <lowering_id>` for each lowering that occured during the cruise.
7. Use scp or rsync to copy the `/home/sealog/sealog-backups/<cruise_id>` folder to the desire data repository.  This folder will contain the sealog cruise-level record and directories for each of the lowerings.  Within each of the lowering directories there will be json-formatted files containing the lowering metadata record, event data and event aux data, a sub-directory of framegrabs and the shell script used to copy the framegrabs from their original location to the framegrab sub-directory.