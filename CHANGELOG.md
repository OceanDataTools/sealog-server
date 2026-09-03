# Change Log

All notable changes to this project will be documented in this file.

## 2.4.7 (2026-09-03)

### Features

* `senderAddress`, `notificationEmailAddresses`, `disableRegisteringUsers`, and `reCaptchaSecret` can now optionally be set via environment variables instead of editing `config/email_settings.js`/`config/server_settings.js` directly (#90, #91)
* Wired up native Gmail OAuth2 email integration, auto-enabled via `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`, replacing dead example code that referenced an unused `googleapis` dependency

### Bug Fixes

* Fixed `SEALOG_SERVER_USE_ACCESS_CONTROL` being parsed with a truthy `||` fallback, where a literal `false` string was always treated as enabled (#77)
* Removed a dead code path in `GET /event_templates` that referenced `query` before it was declared (#78)
* Fixed the `misc/filecrop_utility.py` file-crop utility hanging on empty/blank files and misparsing each source file's header row as data (#79)
* `event_aux_data` PATCH and DELETE (and POST's upsert paths) now publish `updateEventAuxData`/`deleteEventAuxData` websocket events, so other connected clients see attachment updates and deletions live instead of only on refresh (#80)
* Fixed free-space byte/percentage updates breaking under the MongoDB 6 Node driver's `findOneAndUpdate` return shape (#81)
* Fixed lowering and cruise timestamp validation incorrectly rejecting valid combined start/stop updates whose range had shifted relative to the stored one (#82, #89)

### Chores

* Resolved 3 high-severity npm advisories (`brace-expansion`, `browserslist`, `js-yaml`) via `npm audit fix`
* Updated dependencies (`axios`, `joi`, `@json2csv/node`, `nodemailer`)
* Updated Python requirements (`pytz`)

## 2.4.6 (2026-07-25)

### Features

* Added support for the `fulltext` query parameter to the `event_aux_data` routes, matching the existing `events` and `event_exports` behavior

### Chores

* Updated dependencies (`@hapi/hapi`, `@json2csv/node`, `prettier`)
* Updated Python requirements (`influxdb-client`, `jsonschema`, `jsonschema-specifications`, `pymongo`, `pytz`, `PyYAML`)

## 2.4.5 (2026-07-14)

### Features

* Added an optional `event_button_color` field to the event template validation schemas

### Chores

* Updated dependencies (`@hapi/inert`, `axios`, `joi`, `tmp`, `prettier`)

## 2.4.4 (2026-07-05)

### Bug Fixes

* Fixed a race condition in email transporter initialization and added a guard against calling `sendMail` before the transport is ready
* Resolved dependency vulnerabilities flagged by Dependabot

## 2.4.3 (2026-05-21)

### Features

* Event image uploads are now prefixed with the `event_id` to avoid filename collisions; raised max upload size to 256MB
* Refactored the data exporters to a class-based structure
* Updated the CORIOLIX aux data inserter to work with its new REST API

### Bug Fixes

* Reset the development database on test environment startup and fixed `NODE_ENV` handling in the test script

### Chores

* Converted `nodemailer-mj-transport` checks into proper unit tests
* Fixed test infrastructure and outstanding lint issues
* Enhanced misc Python helper scripts
* Bumped `@hapi/hapi`, `@hapi/inert`, `axios`, and `nodemailer` dependencies

## 2.4.2 (2026-04-09)

### Features

* Users can now log in with their email address in addition to their username
* Added event option visibility control, including a new `event_option_visibility` field on the event template schema
* Updated `cruise_create` script to take advantage of OpenVDM 2.11

### Chores

* Ported unit tests from the `dev_2.5` branch and updated Hapi/MongoDB dependencies, fixing resulting compatibility issues
* Updated dependencies

## 2.4.1 (2025-08-09)

### Chores

* Updated npm packages and Python requirements ahead of release, including adding `husky`
* Updated the CORIOLIX/OpenVDM integration script to take advantage of OpenVDM 2.11
* Updated pre-commit hook logic
* Updated INSTALL.md

## 2.4.0 (2025-05-07)

### Features

* Added a GitHub Actions workflow for CI
* Added Husky pre-commit linting (ESLint for JS/`.dist` files, flake8/pylint for Python) for both server and misc scripts
* Added the ability to set the client to view-only mode via docker-compose environment variables
* Added additional error handling to the CORIOLIX integration
* Moved port configuration to the top of the manifest file for visibility

### Bug Fixes

* Corrected `event_template` access permissions for `cruise_manager`s
* Fixed permission bugs in the edit-user API route
* Fixed the default Influx query to work with an OpenRVDAS install

### Chores

* Updated Node and Python dependencies and linting rules
* Updated inline documentation, copyright year, and INSTALL.md

## 2.3.4 (2024-10-19)

### Features

* Added `external_calls` routes for triggering external scripts via the API, plus tooling for cleaning up bad event/aux_data records
* Shortened API route paths used for exports

### Bug Fixes

* Added missing parameter validation so the generated Swagger docs are correct

### Chores

* Updated dependencies and `.gitignore` for external data export calls

## 2.3.3 (2024-09-06)

### Bug Fixes

* Fixed a bug where aux_data records would not be sent unless every field was present in the database

### Changes

* Updated email options and increased max file size; fixed an aux_data_influx bug

## 2.3.2 (2024-08-29)

### Features

* Added KML and GeoJSON output formats to the lowering nav CSV exporter, disabling resampling by default

### Chores

* Renamed and cleaned up the lowering nav exporter script, general codebase cleanup, and additional flake8/pylint fixes

## 2.3.1 (2024-08-06)

### Bug Fixes

* Fixed a query bug affecting event lookups

### Chores

* Updated libraries and unit tests

## 2.3.0 (2024-07-19)

### Features

* Refactored config files to support containerization; all file paths now root at `/data`, and added a file import script
* Added Docker-related files and updated default Docker behavior
* Added a retroactive ASNAP event feature to `sealog_asnap`
* Improved the event query builder to leverage full-text keyword search
* Removed the need to store `resetPasswordURL` on the user record; streamlined password-reset email logic to only execute when the transport is enabled

### Bug Fixes

* Fixed edge cases where `cruise_name`/`cruise_location` exist but are empty
* Fixed directory-creation errors when adding files to a lowering with a missing directory
* Fixed a manifest issue that prevented proper selection of the database name
* Fixed a missing variable bug in the file-import script

### Chores

* Updated dependencies and linted `utils.js` and other files

## 2.2.10 (2024-04-21)

### Features

* Added Mailjet email support via a new `node-mailjet`-based nodemailer transport
* New events are now only published once they are marked complete

### Bug Fixes

* Fixed a database initialization bug when the server is launched in development mode
* Fixed a 500 error and incorrect publish behavior for new events

### Chores

* Updated Docker-related files to `.dist` versions and removed a committed secret key
* Updated Node packages; bumped `follow-redirects`
* Added unit tests for the Mailjet integration

## 2.2.9 (2024-02-29)

### Chores

* Updated libraries, including bumping `nodemailer`
* Updated INSTALL.md and linted code

## 2.2.8 (2024-02-05)

### Bug Fixes

* Fixed an issue preventing non-admin users from changing their own password
* Re-enabled the `resetPasswordURL` variable

### Chores

* Major consolidation of code changes contributed from the SOI fork of sealog-server
* Linted recent changes

## 2.2.7 (2024-01-24)

### Changes

* Simplified database initialization and `manifest.js.dist`

### Chores

* Updated `mkdirp` and `requirements.txt`

## 2.2.6 (2024-01-21)

### Features

* Added an option for cropped files to include headers

### Bug Fixes

* Re-added `resetPasswordURL`, which had been mistakenly removed from the branch

### Chores

* Refactored `email_constants` and updated libraries
* Bumped `axios`, `mongodb`, `word-wrap`, `semver`, `fast-xml-parser`, and `@aws-sdk/credential-providers`

## 2.2.5 (2023-01-10)

### Features

* Added more options for filtering Influx data pulls; added a venv requirements file

### Bug Fixes

* Fixed an issue with cruise/lowering IDs not being included in export output

### Chores

* Bumped `jsonwebtoken`, `hapi-auth-jwt2`, and `json5`

## 2.2.4 (2022-06-10)

### Features

* Expanded the Influx importer to help repair records
* Added missing sort support to event API calls

### Bug Fixes

* Fixed a possible issue with event time filters
* Fixed a string being incorrectly interpreted as a boolean

### Chores

* Updated libraries and the Python wrapper for Sealog
* Bumped `minimist`

## 2.2.3 (2022-03-06)

### Bug Fixes

* Fixed auto-login functionality that had broken during a validations refactor

## 2.2.2 (2022-02-28)

### Bug Fixes

* Fixed record sanitizing for the WebSocket subscription
* Fixed the framegrab inserter and `sealog_repeater` scripts

### Features

* Added a sealog server-sync script to the repo

### Chores

* Updated `axios`, updated inline documentation

## 2.2.1 (2022-02-26)

### Bug Fixes

* Minor bug fix

## 2.2.0 (2022-02-26)

### Features

* Updated to Hapi v20
* Refactored Python scripts to reduce duplicate code

### Bug Fixes

* Fixed record sanitizing and pub/sub behavior for the update-event WebSocket subscription

### Chores

* Updated `manifest.js.dist` and other `.dist` config files
* Linted Python files

## 2.1.5 (2022-01-23)

### Features

* Refactored the password-reset email system

### Bug Fixes

* Fixed a bug in the "forgot password" logic
* Fixed grammatical errors in email text

### Chores

* Removed unused/accidentally-committed files
* Updated INSTALL.md

## 2.1.4 (2021-09-07)

### Features

* Added the option to include dive/lowering values in CSV exports

### Bug Fixes

* Fixed `get_cruises_by_lowering` route logic, including an edge case where a lowering happens on the last day of a cruise

### Chores

* Updated INSTALL.md

## 2.1.3 (2021-08-19)

* Version increment; no functional changes

## 2.1.2 (2021-08-01)

### Bug Fixes

* Fixed data export failing when `/tmp` is not on the same filesystem mount as the data export directory

### Chores

* Reduced duplicate code in data export scripts

## 2.1.1 (2021-07-24)

### Features

* `python_sealog` now supports a custom server URL and custom headers

### Bug Fixes

* Fixed a bug in the `influx_sealog` library that threw an error when no data was found in InfluxDB

## 2.1.0 (2021-05-12)

### Features

* Added the ability to auto-login via an iFrame
* Added `sealog_vessel_data_export.py.dist` and a lowering-nav-to-CSV export script
* Continued refinement of the reporting and data export scripts, including a generalized reporting framework

### Bug Fixes

* Fixed the login token not being created on the user POST route
* Fixed handling of a cruise with no lowerings

### Chores

* Extensive pylint cleanup of the Python `.dist` scripts
* Removed pre-2.1 legacy files
* Updated README.md and INSTALL.md

## 2.0.3 (2021-04-23)

### Features

* Added a URL query parameter to export cruise/lowering API calls in CSV format

## 2.0.2 (2021-04-21)

### Changes

* Updated the cruise create/update JOI validation objects, adding missing fields (including `metadata`)
* Added `sealog-cruiseSync.py.dist`
* Converted `sealog_vehicle_data_export` to a `.dist` file

## 2.0.1 (2021-04-13)

### Features

* Multiple server changes and feature additions

### Bug Fixes

* Fixed the `updateEvents` WebSocket feed sending the original (pre-update) event instead of the updated one
* Tweaked `newEvent`/`updatedEvent` WebSocket subscription behavior: when an event's timestamp is changed, its aux_data records are now deleted and the updated event is emitted on the `newEvent` subscription

### Chores

* Updated `sealog-auxDataInserter-influx.py.dist`

# 2.0.0 (2020-06-24)

### Features

* increase nodeJS dependency to v12.x
* supports sealog-client v2.x

### BREAKING CHANGES

* no longer supports nodeJS v8.x

## 1.0.0 (2020-04-20)

* supports nodeJS v8.x
* supports sealog-client v1.x
