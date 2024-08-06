const Nodemailer = require('nodemailer'); // eslint-disable-line no-unused-vars
const Mj = require('../lib/nodemailer-mailjet-transport'); // eslint-disable-line no-unused-vars

const {
  senderAddress,
  notificationEmailAddresses,
  emailTransporter
} = require('../config/email_settings');

let mailOptions = {
	from: senderAddress,
	to: '<RECIPIENT_ADDR>', // <-- change this to valid recipient 
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