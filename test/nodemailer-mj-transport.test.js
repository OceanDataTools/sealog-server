const Nodemailer = require('nodemailer'); // eslint-disable-line no-unused-vars
const Mj = require('../lib/nodemailer-mailjet-transport'); // eslint-disable-line no-unused-vars

const {
  senderAddress,
  notificationEmailAddresses
} = require('../config/email_settings');

// ========================================================================= //
// Pick ONE:
// If you use the one from email_settings you may want to add
// sandboxMode: true to the options list.
// ========================================================================= //
const { emailTransporter } = require('../config/email_settings');
// ------------------------------------------------------------------------- //
// const emailTransporter = Nodemailer.createTransport(Mj({
//   sandboxMode: true,
//   auth: {
//     apiKey: '<MJ_APIKEY_PUBLIC>',
//     apiSecret: '<MJ_APIKEY_PRIVATE>'
//   }
// })); // eslint-disable-line no-dupe-keys
// ------------------------------------------------------------------------- //

let mailOptions = {
	from: senderAddress,
	to: '<RECIPIENT_ADDR>',
	bcc: notificationEmailAddresses,
	subject: 'Welcome to Sealog',
	html: `<p>Welcome to Sealog. If you are receiving this email you have just created an account on Sealog (...).</p>
	<p>If you have any questions please reply to this email address</p><p>Thanks!</p>`
};

console.log(mailOptions);

emailTransporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('Error sending email:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});