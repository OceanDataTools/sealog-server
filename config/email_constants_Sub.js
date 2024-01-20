// Only needed if using email integration
// const Nodemailer = require('nodemailer'); // eslint-disable-line no-unused-vars

// Only needed if using Mailgun
// const Mg = require('nodemailer-mailgun-transport'); // eslint-disable-line no-unused-vars

// The sender address for all emails
const senderAddress = 'sealog_admin@oceandatatools.org';

// Additional receipents for and sent emails.
const notificationEmailAddresses = [];

// URL of password reset form
// Set the protocol (http/https), serverURL/IP and port number to match the server's configuration
const resetPasswordURL = 'http://10.23.9.25/sealog-Sub/resetPassword/';

// Server-side reCaptcha key, set to '' if not using reCaptcha bot protection
const reCaptchaSecret = '';

// Disable registering users, requires Sealog admin user to enable the accounts prior to use
const disableRegisteringUsers = false;

// Default roles of self-registering users
const registeringUserRoles = ['event_watcher', 'event_logger', 'template_manager'];

// Activate per-cruise/per-lowering access permissions
const useAccessControl = false;

// Uncomment one of the following

// Not using email
const emailTransporter = null;

// Using GMail integration
// const emailTransporter = Nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: 'username@gmail.com',
//     pass: 'password'
//   }
// }); // eslint-disable-line no-dupe-keys

// Using Mailgun integration
// const emailTransporter = Nodemailer.createTransport(Mg({
//   auth: {
//     api_key: 'key-1234123412341234',
//     domain: 'one of your domain names listed at your https://app.mailgun.com/app/sending/domains'
//   }
// })); // eslint-disable-line no-dupe-keys

module.exports = {
  senderAddress,
  emailTransporter,
  notificationEmailAddresses,
  resetPasswordURL,
  reCaptchaSecret,
  disableRegisteringUsers,
  registeringUserRoles,
  useAccessControl
};
