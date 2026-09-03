const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');

const { afterEach, beforeEach, describe, it } = exports.lab = Lab.script();

const configPath = require.resolve('../config/email_settings.js.dist');
const emailEnvVars = [
  'SEALOG_SERVER_SENDER_ADDRESS',
  'SEALOG_SERVER_NOTIFICATION_EMAIL_ADDRESSES',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN'
];

const originalEnv = {};

describe('Email settings', () => {

  beforeEach(() => {

    emailEnvVars.forEach((name) => {

      originalEnv[name] = process.env[name];
      delete process.env[name];
    });
    delete require.cache[configPath];
  });

  afterEach(() => {

    emailEnvVars.forEach((name) => {

      if (originalEnv[name] === undefined) {
        delete process.env[name];
      }
      else {
        process.env[name] = originalEnv[name];
      }
    });
    delete require.cache[configPath];
  });

  it('falls back to placeholder sender and notification addresses when unset', () => {

    const { senderAddress, notificationEmailAddresses } = require(configPath);

    expect(senderAddress).to.equal('<SENDER_ADDRESS>');
    expect(notificationEmailAddresses).to.equal(['<BCC_ADDRESS>']);
  });

  it('disables email when Gmail credentials are missing', () => {

    const { emailTransporter } = require(configPath);

    expect(emailTransporter).to.be.null();
  });

  it('disables email when Gmail credentials are incomplete', () => {

    process.env.GMAIL_CLIENT_ID = 'test-client-id';

    const { emailTransporter } = require(configPath);

    expect(emailTransporter).to.be.null();
  });

  it('loads sender and notification addresses from the environment', () => {

    process.env.SEALOG_SERVER_SENDER_ADDRESS = 'sender@example.com';
    process.env.SEALOG_SERVER_NOTIFICATION_EMAIL_ADDRESSES =
      'first@example.com, second@example.com';

    const { senderAddress, notificationEmailAddresses } = require(configPath);

    expect(senderAddress).to.equal('sender@example.com');
    expect(notificationEmailAddresses).to.equal([
      'first@example.com',
      'second@example.com'
    ]);
  });

  it('exports a synchronous transporter when Gmail credentials are present', () => {

    process.env.SEALOG_SERVER_SENDER_ADDRESS = 'sender@example.com';
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

    const { emailTransporter } = require(configPath);

    expect(typeof emailTransporter.then).to.equal('undefined');
    expect(typeof emailTransporter.sendMail).to.equal('function');
    expect(typeof emailTransporter.verify).to.equal('function');

    const auth = emailTransporter.transporter.options.auth;

    expect(auth.user).to.equal('sender@example.com');
    expect(auth.clientId).to.equal('test-client-id');
    expect(auth.clientSecret).to.equal('test-client-secret');
    expect(auth.refreshToken).to.equal('test-refresh-token');
    expect(auth.accessToken).to.not.exist();
  });

});
