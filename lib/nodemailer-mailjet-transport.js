// nodemailer-mailjet-transport
const Mailjet = require('node-mailjet');


class MailjetTransport {
  constructor(options) {

    this.options = options;
    this.mailjet = new Mailjet({
      apiKey: this.options.auth.apiKey,
      apiSecret: this.options.auth.apiSecret
    });
    // this.mailjet = require('node-mailjet').connect(this.options.auth.apiKey, this.options.auth.apiSecret);
  }

  send(mailOptions, callback) { // eslint-disable-line no-unused-vars

    // Convert from field to required object
    if (typeof mailOptions.data.from === 'string') {
      mailOptions.data.from = { address: mailOptions.data.from, name: mailOptions.data.from };
    }

    if (!Object.hasOwn(mailOptions.data.from, 'name')) {
      mailOptions.data.from.name = mailOptions.data.from.address;
    }

    // Convert to field to required object
    if (typeof mailOptions.data.to === 'string') {
      mailOptions.data.to = mailOptions.data.to.split(',').map((addr) => {

        return { address: addr, name: addr };
      });
    }
    else if (mailOptions.data.to.constructor === Array) {

      mailOptions.data.to = mailOptions.data.to.map((addr) => {

        if (typeof addr === 'string') {
          return { address: addr, name: addr };
        }

        return addr;
      });
    }
    else if (typeof mailOptions.data.to === 'object') {
      mailOptions.data.to = [mailOptions.data.to];
    }

    mailOptions.data.to = mailOptions.data.to.map((addr) => {

      if (!Object.hasOwn(addr, 'name') || addr.name === '') {
        addr.name = addr.address;
      }

      return addr;
    });

    // Convert cc field cc required object
    if (mailOptions.data.cc) {
      if (typeof mailOptions.data.cc === 'string') {
        mailOptions.data.cc = mailOptions.data.cc.split(',').map((addr) => {

          return { address: addr, name: addr };
        });
      }
      else if (mailOptions.data.cc.constructor === Array) {
        mailOptions.data.cc = mailOptions.data.cc.map((addr) => {

          return { address: addr, name: addr };
        });
      }
      else if (typeof mailOptions.data.cc === 'object') {
        mailOptions.data.cc = [mailOptions.data.cc];
      }

      mailOptions.data.cc = mailOptions.data.cc.map((addr) => {

        if (!Object.hasOwn(addr, 'name') || addr.name === '') {
          addr.name = addr.address;
        }

        return addr;
      });
    }

    // Convert bcc field bcc required object
    if (mailOptions.data.bcc) {
      if (typeof mailOptions.data.bcc === 'string') {
        mailOptions.data.bcc = mailOptions.data.bcc.split(',').map((addr) => {

          return { address: addr, name: addr };
        });
      }
      else if (mailOptions.data.bcc.constructor === Array) {
        mailOptions.data.bcc = mailOptions.data.bcc.map((addr) => {

          if (typeof addr === 'string') {
            return { address: addr, name: addr };
          }

          return addr;
        });
      }
      else if (typeof mailOptions.data.bcc === 'object') {
        mailOptions.data.bcc = [mailOptions.data.bcc];
      }

      mailOptions.data.bcc = mailOptions.data.bcc.map((addr) => {

        if (!Object.hasOwn(addr, 'name') || addr.name === '') {
          addr.name = addr.address;
        }

        return addr;
      });
    }

    const data = {
      SandboxMode: this.options.sandboxMode || false,
      Messages: [{
        From: {
          Email: mailOptions.data.from.address,
          Name: mailOptions.data.from.name
        },
        To: mailOptions.data.to.map((addr) => ({

          Email: addr.address,
          Name: addr.name
        })),
        Cc: mailOptions.data.cc ? mailOptions.data.cc.map((addr) => ({

          Email: addr.address,
          Name: addr.name
        })) : [],
        Bcc: mailOptions.data.bcc ? mailOptions.data.bcc.map((addr) => ({

          Email: addr.address,
          Name: addr.name
        })) : [],
        Subject: mailOptions.data.subject,
        TextPart: mailOptions.data.text,
        HTMLPart: mailOptions.data.html
      }]
    };

    const request = this.mailjet.post('send', { 'version': 'v3.1' }).request(data);

    request
      .then((result) => {

        console.debug(JSON.stringify(result.body, null, ' '));
      })
      .catch((err) => {

        console.error("ERROR: ", err.statusCode);
      });
  }
}

module.exports = function (options) {

  return new MailjetTransport(options);
};

module.exports.MailjetTransport = MailjetTransport;
