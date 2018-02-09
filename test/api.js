'use strict';

const Code = require('code');
const Lab = require('lab');
const LabbableServer = require('../server.js');

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const before = lab.before;
const expect = Code.expect;

describe('Server', () => {
  let apiServer;

  before((done) => {

    // Callback fires once the server is initialized
    // or immediately if the server is already initialized
    LabbableServer.ready({timeout: 5000}).then((srv) => {

//      if (err) {
//        return done(err);
//      }

      apiServer = srv.select('api');

      return done();
    });
  });

  const prefix = "/sealog-server";

  const validUserJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYjlmNSIsInNjb3BlIjpbImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3NDE5MjgwfQ.HuerD-OOcY3ecNPh-BJRhYJJdSkp4hZHpCnZjiIyRk0";
  const validAdminJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3MzQ4Nzc4fQ.Ig1O1Cgt235am0_1ybHcN3TWzSBNhh3LU_jUNiYp0W4";
  const invalidJWT = "fyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU5ODFmMTY3MjEyYjM0OGFlZDdmYTlmNSIsInNjb3BlIjpbImFkbWluIiwiZXZlbnRfbWFuYWdlciIsImV2ZW50X2xvZ2dlciIsImV2ZW50X3dhdGNoZXIiXSwiaWF0IjoxNTE3MzQ4Nzc4fQ.Ig1O1Cgt235am0_1ybHcN3TWzSBNhh3LU_jUNiYp0W4";

  const validUserID = "5981f167212b348aed7fb9f5";
  const validAdminID = "5981f167212b348aed7fa9f5";  
  const invalidUserID = "5981f167212b348aed7fb9f2";

  const validEventID = "5981f167212b348aed7fa9f7";  
  const validEventID2 = "5981f167212b348aed7fa9f8";  
  const invalidEventID = "5981f167212b348aed7fb9f2";

  const validEventTemplateID = "5a71c3d7fa96aa1977822b2c";
  const invalidEventTemplateID = "5a71c3d7fa96aa1977822b2a";

  const validEventTemplateSetID = "5a73235e88acc0234103fa33";
  const invalidEventTemplateSetID = "5a73235e88acc0234103fa32";

  const validEventAuxDataID = "5a7341898c1553258f703ce8";
  const invalidEventAuxDataID = "5a7341898c1553258f703ce9";

  // server is now available to be tested
  it('initializes.', (done) => {

    expect(apiServer).to.exist();

    // isInitialized() can be used to check the server's init state
    expect(LabbableServer.isInitialized()).to.equal(true);
    done();
  });

  it('Known route should return http status 200', done => {
    apiServer.inject(prefix + '/', response => {
      expect(response.statusCode).to.equal(200);
      done();
    });
  });

  it('Unknown route should return http status 404', done => {
    apiServer.inject(prefix + '/unkownroute', response => {
      expect(response.statusCode).to.equal(404);
      done();
    });
  });

  it('Restricted route should return http status 401 for anonymous user', done => {
    apiServer.inject(prefix + '/restricted', response => {
      expect(response.statusCode).to.equal(401);
      done();
    });
  });

  it('Restricted route should return http status 403 for authenticated user that is not authorized for the route.', done => {
    var options = {
      method: 'GET',
      url: prefix + '/restricted',
      headers: {
        'Authorization': validUserJWT,
        'Content-Type': 'application/json; charset=utf-8'
      }
    };
    apiServer.inject(options, response => {
      expect(response.statusCode).to.equal(403);
      done();
    });
  });

  it('Restricted route should return http status 200 for authenticated user that is authorized for the route', done => {
    var options = {
      method: 'GET',
      url: prefix + '/restricted',
      headers: {
        'Authorization': validAdminJWT,
        'Content-Type': 'application/json; charset=utf-8'
      }
    };
    apiServer.inject(options, response => {
      expect(response.statusCode).to.equal(200);
      done();
    });
  });

  //auth.js
  describe('Auth', () => {
    it('Login route should return http status 400 if no payload provided', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/login',
        payload: {}
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    it('Login route should return http status 401 for bad user/pass payload', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/login',
        payload: {
          'username': 'user',
          'password': 'bad_password'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it('Login route should return http status 200 for good user/pass payload', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/login',
        payload: {
          'username': 'user',
          'password': 'password'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    it('Restricted auth route that should return http status 200 because the JWT is valid', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/validate',
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    it('Restricted auth route that should return http status 401 because the JWT is invalid', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/validate',
        headers: {
          'Authorization': invalidJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

  });


  // api/v1/users.js
  describe('Users', () => {
    it('Restricted users route should return the list of user records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/users',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    it('Restricted users route should return the list of user records sorted by last_login and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/users?sort=last_login',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    it('Restricted users route requesting user record using invalid id should return 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/users/' + invalidUserID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    it('Restricted users route requesting a user record without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/users/' + validUserID,
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it('Restricted users route should return the user record specified by the given id param and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/users/' + validUserID,
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    it('Restricted users route updating a user record without a payload should return 400', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + validUserID,
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    it('Restricted users route updating a user record with an invalid id should return 400', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + invalidUserID,
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          email: 'asoule@whoi.edu'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    it('Restricted users route updating a user record without authentication should return 401', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + validUserID,
        payload: {
          email: 'asoule@whoi.edu'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it('Restricted users route updating a user record should return 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + validUserID,
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          email: 'asoule@whoi.edu'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });


    it('Restricted users route updating a user\'s favorites correctly should return 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + validUserID + '/favorites',
        headers: {
          'Authorization': validUserJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          favorites: [validEventTemplateID]
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    it('Restricted users route updating a user\'s favorites without authorization should return 401', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/users/' + validUserID + '/favorites',
        payload: {
          favorites: [validEventTemplateID]
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it('Restricted users route deleting the currently authenticated user should return 400', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/users/' + validAdminID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    it('Restricted users route deleting a user without authentication should return 401', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/users/' + validUserID,
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it('Restricted users route deleting a user record should return 204', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/users/' + validUserID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    it('Restricted users route deleting a non-existent user record should return 404', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/users/' + validUserID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });
  });

  /* event_exports */
  describe('Event Exports', () => {
    it('Restricted event_exports route requesting event records without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports',
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    // query all event exports
    it('Restricted event_exports route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query a single event
    it('Restricted event_exports route should return a single event record and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports/' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query an invalid single event export
    it('Restricted event_exports route should return a not found message and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports/' + invalidEventID, // invalid GUID
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event exports based on data source
    it('Restricted event_exports route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?datasource=framegrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on multiple data source
    it('Restricted event_exports route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?datasource=framegrabber&datasource=datagrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

      // query all event exports based on data source
    it('Restricted event_exports route should return not found because datasource does not exist and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?datasource=invalidgrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });


    // query all event exports based on time bounds
    it('Restricted event_exports route should return all event records that were made after a start time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?startTS=2000-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on time bounds
    it('Restricted event_exports route should return all event records that were made before a stop time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?stopTS=2020-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on time bounds
    it('Restricted event_exports route should no event records because no event exports match the time filers and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?stopTS=2000-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event exports based on time bounds
    it('Restricted event_exports route should return all event records that occurred between a start and stop time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?startTS=2000-01-01T12:00:00.000Z&stopTS=2020-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on time bounds
    it('Restricted event_exports route with a time query but malformed time string and a http status 400', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?stopTS=2020-0101T12:00:00.000Z', // should be: 2020-01-01T12:00:00.000Z
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // query all event exports based on user
    it('Restricted event_exports route with a user query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?author=testuser',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on user
    it('Restricted event_exports route with a user query but no returned event exports and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?author=Webb%20Pinner',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event exports based on multiple users
    it('Restricted event_exports route with a multiple user queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?author=testuser&author=testadmin',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on value
    it('Restricted event_exports route with a value query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?value=FISH',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on multiple values
    it('Restricted event_exports route with a multiple value queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?value=FISH&value=CORAL',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports based on freetext
    it('Restricted event_exports route with a single freetext query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?freetext=some',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports but return a specific number of event exports
    it('Restricted event_exports route with a limit to number of returned event exports and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?limit=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event exports but with an offset
    it('Restricted event_exports route with a offset to first returned event exports and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_exports?offset=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });
  });

  /* events */
  describe('Events', () => {
    it('Restricted events route requesting event records without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events',
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    // query all events
    it('Restricted events route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query a single event
    it('Restricted events route should return a single event record and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events/' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query an invalid single event
    it('Restricted events route should return a not found message and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events/' + invalidEventID, // invalid GUID
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all events based on data source
    it('Restricted events route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?datasource=framegrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on multiple data source
    it('Restricted events route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?datasource=framegrabber&datasource=datagrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

      // query all events based on data source
    it('Restricted events route should return not found because datasource does not exist and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?datasource=invalidgrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });


    // query all events based on time bounds
    it('Restricted events route should return all event records that were made after a start time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?startTS=2000-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on time bounds
    it('Restricted events route should return all event records that were made before a stop time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?stopTS=2020-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on time bounds
    it('Restricted events route should no event records because no events match the time filers and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?stopTS=2000-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all events based on time bounds
    it('Restricted events route should return all event records that occurred between a start and stop time and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?startTS=2000-01-01T12:00:00.000Z&stopTS=2020-01-01T12:00:00.000Z',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on time bounds
    it('Restricted events route with a time query but malformed time string and a http status 400', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?stopTS=2020-0101T12:00:00.000Z', // should be: 2020-01-01T12:00:00.000Z
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // query all events based on user
    it('Restricted events route with a user query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?user=testuser',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on user
    it('Restricted events route with a user query but no returned events and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?author=invalidUser',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all events based on multiple users
    it('Restricted events route with a multiple user queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?user=testuser&user=testadmin',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on value
    it('Restricted events route with a value query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?value=FISH',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on multiple values
    it('Restricted events route with a multiple value queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?value=FISH&value=CORAL',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events based on freetext
    it('Restricted events route with a single freetext query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?freetext=some',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events but return a specific number of events
    it('Restricted events route with a limit to number of returned events and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?limit=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events but with an offset
    it('Restricted events route with a offset to first returned events and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/events?offset=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // update an event but with an invalid payload
    it('Restricted events route to update an event with an invalid payload and a http status 400', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/events/' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          //event_value: "Test",
          event_options: [{
            event_option_name: "option1"
            //event_option_value: "option_value01"
          }]  
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // update an event but with an valid payload
    it('Restricted events route to update an event with an valid payload and a http status 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/events/' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          //event_value: "Test",
          event_options: [{
            event_option_name: "option1",
            event_option_value: "option_value01"
          }]  
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    // delete an event but with a valid but non-existent uuid
    it('Restricted events route to delete an event with an invalid id and a http status 404', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/events/' + invalidEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // delete an event but with an invalid payload
    it('Restricted events route to delete an event with an valid id and a http status 204', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/events/' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });
  });

  /* event_templates */
  describe('Event Definitions', () => {
    it('Restricted event_templates route requesting event template records without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates',
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    // query all events
    it('Restricted event_templates route should return all event template records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query a single event template
    it('Restricted event_templates route should return a single event template record and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates/' + validEventTemplateID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query an invalid single event
    it('Restricted event_templates route should return a not found message and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates/' + invalidEventTemplateID, // invalid GUID
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event templates but return a specific number of event templates
    it('Restricted event_templates route with a limit to number of returned event templates and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates?limit=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events but with an offset
    it('Restricted event_templates route with a offset to first returned event templates and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_templates?offset=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_templates route to create an event template with an invalid payload and a http status 400', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/event_templates',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          "event_template_name": "Awesomer Events"
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_templates route to create an event template with an invalid payload and a http status 201', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/event_templates',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          event_name: "Coral_btn",
          event_value: "CORAL",
          event_free_text_required: false,
          event_options: [{
            event_option_name: "Status",
            event_option_type: "dropdown",
            event_option_default_value: "",
            event_option_values: ["dead", "alive"],
            event_option_allow_freeform: false,
            event_option_required: true
          }]
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(201);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_templates route to update an event template with an valid payload and a http status 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/event_templates/' + validEventTemplateID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          "event_value": "Shark"
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    // delete an event template but with a valid but non-existent uuid
    it('Restricted event_templates route to delete an event template with an invalid id and a http status 404', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_templates/' + invalidEventTemplateID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // delete an event template but with an invalid payload
    it('Restricted event_templates route to delete an event template with an valid id and a http status 204', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_templates/' + validEventTemplateID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });
  });

  /* event_template_sets */
  describe('Event Template Sets', () => {
    it('Restricted event_template_sets route requesting event template records without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets',
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    // query all events
    it('Restricted event_template_sets route should return all event template records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query a single event template
    it('Restricted event_template_sets route should return a single event template record and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets/' + validEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query an invalid single event
    it('Restricted event_template_sets route should return a not found message and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets/' + invalidEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event templates but return a specific number of event templates
    it('Restricted event_template_sets route with a limit to number of returned event templates and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets?limit=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all events but with an offset
    it('Restricted event_template_sets route with a offset to first returned event templates and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_template_sets?offset=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_template_sets route to create an event template with an invalid payload and a http status 400', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/event_template_sets',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          "event_templates": [validEventTemplateID]
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_template_sets route to create an event template with an invalid payload and a http status 201', done => {
      var options = {
        method: 'POST',
        url: prefix + '/api/v1/event_template_sets',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          event_template_set_name: "Awesomest Events",
          event_templates: [validEventTemplateID]
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(201);
        done();
      });
    });

    // update an event template but with an invalid payload
    it('Restricted event_template_sets route to update an event template with an invalid payload and a http status 400', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/event_template_sets/' + validEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          event_templates: "option1"
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // update an event template but with an valid payload
    it('Restricted event_template_sets route to update an event template with an valid payload and a http status 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/event_template_sets/' + validEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          "event_template_name": "Awesomer Events"
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    // delete an event template but with a valid but non-existent uuid
    it('Restricted event_template_sets route to delete an event template with an invalid id and a http status 404', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_template_sets/' + invalidEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // delete an event template but with an invalid payload
    it('Restricted event_template_sets route to delete an event template with an valid id and a http status 204', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_template_sets/' + validEventTemplateSetID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });
  });

  /* event_aux_data */
  describe('Event Aux Data', () => {
    it('Restricted event_aux_data route requesting event_aux_data records without authentication should return a http status 401', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data',
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    // query all event_aux_data
    it('Restricted event_aux_data route should return all event records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query a single event_aux_data
    it('Restricted event_aux_data route should return a single event record and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data/' + validEventAuxDataID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query an invalid single event_aux_data
    it('Restricted event_aux_data route should return a not found message and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data/' + invalidEventAuxDataID, // invalid GUID
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event_aux_data based on datasource
    it('Restricted event_aux_data route should return all event records based on datasource and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?datasource=framegrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event_aux_data based on multiple data source
    it('Restricted event_aux_data route should return all event_aux_data records based on two datasource queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?datasource=framegrabber&datasource=datagrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

      // query all events based on data source
    it('Restricted event_aux_data route should return not found because datasource does not exist and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?datasource=invalidgrabber',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event_aux_data based on eventID
    it('Restricted event_aux_data route with a eventID query and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?eventID=' + validEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event_aux_data based on eventID
    it('Restricted event_aux_data route with a eventID query but no returned events and a http status 404', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?eventID=' + invalidEventID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // query all event_aux_data based on multiple eventIDs
    it('Restricted event_aux_data route with a multiple eventID queries and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?eventID=' + validEventID + '&eventID=' + validEventID2,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });


    // query all event_aux_data but return a specific number of events
    it('Restricted event_aux_data route with a limit to number of returned event_aux_data records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?limit=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // query all event_aux_data but with an offset
    it('Restricted event_aux_data route with a offset to first returned event_aux_data records and a http status 200', done => {
      var options = {
        method: 'GET',
        url: prefix + '/api/v1/event_aux_data?offset=1',
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

    // update an event_aux_data but with an invalid payload
    it('Restricted event_aux_data route to update an event_aux_data record with an invalid payload and a http status 400', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/event_aux_data/' + validEventAuxDataID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          //event_value: "Test",
          data_array: [{
            data_name: "option1"
            //event_option_value: "option_value01"
          }]  
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(400);
        done();
      });
    });

    // update an event_aux_data but with an valid payload
    it('Restricted event_aux_data route to update an event_aux_data record with an valid payload and a http status 204', done => {
      var options = {
        method: 'PATCH',
        url: prefix + '/api/v1/event_aux_data/' + validEventAuxDataID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
        payload: {
          data_array: [{
            data_name: "option1",
            data_value: "option_value01"
          }]  
        }
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });

    // delete an event_aux_data but with a valid but non-existent uuid
    it('Restricted event_aux_data route to delete an event_aux_data record with an invalid id and a http status 404', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_aux_data/' + invalidEventAuxDataID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(404);
        done();
      });
    });

    // delete an event but with an invalid payload
    it('Restricted event_aux_data route to delete an event_aux_data record with an valid id and a http status 204', done => {
      var options = {
        method: 'DELETE',
        url: prefix + '/api/v1/event_aux_data/' + validEventAuxDataID,
        headers: {
          'Authorization': validAdminJWT,
          'Content-Type': 'application/json; charset=utf-8'
        },
      };
      apiServer.inject(options, response => {
        expect(response.statusCode).to.equal(204);
        done();
      });
    });
  });
});
