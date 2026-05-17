const Nodemailer = require('nodemailer'); // eslint-disable-line no-unused-vars
const Mj = require('../lib/nodemailer-mailjet-transport'); // eslint-disable-line no-unused-vars

const emailTransporter = Nodemailer.createTransport(Mj({
  sandboxMode: true,
  auth: {
    apiKey: process.env.MJ_APIKEY_PUBLIC || 'b0e4226e59689981f28d50a3a88b718c',
    apiSecret: process.env.MJ_APIKEY_PRIVATE || 'ecffe18362c1cd56d914d2bce302323e'
  }
}));

let mailOptions = {
  from: 'oceandatarat@gmail.com',
  to: '<RECIPIENT_ADDR>', // <-- change this to valid recipient 
  bcc: [],
  subject: 'Welcome to Sealog',
  html: `<p>Welcome to Sealog. If you are receiving this email you have just created an account on Sealog (...).</p>
  <p>If you have any questions please reply to this email address</p><p>Thanks!</p>`
};

// console.log(mailOptions);

emailTransporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('Error sending email:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});