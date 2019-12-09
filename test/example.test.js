'use strict';

const Glue = require('@hapi/glue');
const Lab = require('@hapi/lab');
const Manifest = require('../config/manifest');

const { expect, done } = require('@hapi/code');

const { afterEach, beforeEach, describe, it } = exports.lab = Lab.script();

const { init } = require('../server');

const options = {
  relativeTo: __dirname
};

describe('GET /', () => {

  Glue.compose(Manifest, options, (err, server) => {

    if (err) {
      throw err;
    }

    // beforeEach(async () => {
    //   server = await init();
    // });

    // afterEach(async () => {
    //   await server.stop();
    // });

    // it('responds with 200', async () => {
    //   const res = await server.inject({
    //     method: 'get',
    //     url: '/'
    //   });
    //   expect(res.statusCode).to.equal(200);
    // });

    it('responds with 200', async () => {

      const res = await server.inject({
        method: "GET",
        url: "/"
      }).then((response) => {

        expect(response.result).to.equal("Welcome to server!\n");
        expect(response.statusCode).to.equal(200);
        done();
      });
    });
  });
});