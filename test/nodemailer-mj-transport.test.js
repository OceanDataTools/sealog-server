const Nodemailer = require('nodemailer'); // eslint-disable-line no-unused-vars
const Mj = require('../lib/nodemailer-mailjet-transport'); // eslint-disable-line no-unused-vars

const {
  senderAddress,
  notificationEmailAddresses
} = require('../config/email_constants');

const emailTransporter = Nodemailer.createTransport(Mj({
  auth: {
    apiKey: 'b0e4226e59689981f28d50a3a88b718c',
    apiSecret: 'ecffe18362c1cd56d914d2bce302323e'
  }
})); // eslint-disable-line no-dupe-keys

let mailOptions = {
	from: senderAddress, // sender address
	to: 'oceandatarat@gmail.com', // list of receivers
	bcc: notificationEmailAddresses,
	subject: 'Welcome to Sealog', // Subject line
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