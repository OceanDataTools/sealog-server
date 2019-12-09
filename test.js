// "use strict";

const Glue = require("@hapi/glue");
const Code = require("@hapi/code");
const Lab = require("@hapi/lab");

const Manifest = require('./config/manifest');

const options = {
  relativeTo: __dirname
};

const { expect } = Code;

const lab = exports.lab = Lab.script();

lab.test("Testing / for successs", (done) => {

  Glue.compose(Manifest, options, (err, server) => {

    if (err) {
      throw err;
    }

    server.inject({ method: "GET", url: "/" }, (response) => {

      expect(response.result).to.equal("Welcome to server!\n");
      expect(response.statusCode).to.equal(200);
      done();
    });

    server.inject({ method: "GET", url: "/" }, (response) => {

      expect(response.result).to.equal("Welcome to sealog-server!\n");
      expect(response.statusCode).to.equal(200);
      done();
    });
  });
});
