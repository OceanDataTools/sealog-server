'use strict';

const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { describe, it } = exports.lab = Lab.script();
const { MailjetTransport } = require('../lib/nodemailer-mailjet-transport');

// Build a transport whose mailjet client is stubbed so no real API calls
// are made. The stub captures the payload passed to request() synchronously,
// which lets assertions run immediately after send() returns.
const makeTransport = (sandboxMode = true) => {
  const transport = new MailjetTransport({
    sandboxMode,
    auth: { apiKey: 'test-key', apiSecret: 'test-secret' }
  });

  let captured = null;
  transport.mailjet = {
    post: () => ({
      request: (data) => {
        captured = data;
        return Promise.resolve({ body: {} });
      }
    })
  };

  return {
    send: (mailData) => {
      transport.send({ data: Object.assign({}, mailData) }, () => {});
      return captured;
    }
  };
};

describe('MailjetTransport address normalization', () => {

  describe('from field', () => {

    it('converts string to { address, name }', () => {
      const { send } = makeTransport();
      const result = send({ from: 'sender@example.com', to: 'r@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].From).to.equal({ Email: 'sender@example.com', Name: 'sender@example.com' });
    });

    it('preserves existing name on from object', () => {
      const { send } = makeTransport();
      const result = send({ from: { address: 'sender@example.com', name: 'Sender' }, to: 'r@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].From).to.equal({ Email: 'sender@example.com', Name: 'Sender' });
    });

  });

  describe('to field', () => {

    it('converts comma-separated string to array of objects', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'a@example.com,b@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].To).to.have.length(2);
      expect(result.Messages[0].To[0]).to.equal({ Email: 'a@example.com', Name: 'a@example.com' });
      expect(result.Messages[0].To[1]).to.equal({ Email: 'b@example.com', Name: 'b@example.com' });
    });

    it('converts array of strings to array of objects', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: ['a@example.com', 'b@example.com'], subject: 'S', html: '<p/>' });
      expect(result.Messages[0].To).to.have.length(2);
      expect(result.Messages[0].To[0]).to.equal({ Email: 'a@example.com', Name: 'a@example.com' });
    });

    it('wraps single to object in array', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: { address: 'r@example.com', name: 'R' }, subject: 'S', html: '<p/>' });
      expect(result.Messages[0].To).to.have.length(1);
      expect(result.Messages[0].To[0]).to.equal({ Email: 'r@example.com', Name: 'R' });
    });

    it('fills in missing name from address', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: [{ address: 'r@example.com' }], subject: 'S', html: '<p/>' });
      expect(result.Messages[0].To[0]).to.equal({ Email: 'r@example.com', Name: 'r@example.com' });
    });

  });

  describe('bcc field', () => {

    it('converts string bcc to array of objects', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', bcc: 'b@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].Bcc).to.have.length(1);
      expect(result.Messages[0].Bcc[0]).to.equal({ Email: 'b@example.com', Name: 'b@example.com' });
    });

    it('converts array of strings bcc to array of objects', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', bcc: ['b1@example.com', 'b2@example.com'], subject: 'S', html: '<p/>' });
      expect(result.Messages[0].Bcc).to.have.length(2);
    });

    it('produces empty Bcc array when bcc is omitted', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].Bcc).to.equal([]);
    });

  });

  describe('cc field', () => {

    it('converts string cc to array of objects', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', cc: 'c@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].Cc).to.have.length(1);
      expect(result.Messages[0].Cc[0]).to.equal({ Email: 'c@example.com', Name: 'c@example.com' });
    });

    it('produces empty Cc array when cc is omitted', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', subject: 'S', html: '<p/>' });
      expect(result.Messages[0].Cc).to.equal([]);
    });

  });

  describe('payload structure', () => {

    it('sets SandboxMode from constructor options', () => {
      const { send } = makeTransport(true);
      const result = send({ from: 'f@example.com', to: 'r@example.com', subject: 'S', html: '<p/>' });
      expect(result.SandboxMode).to.be.true();
    });

    it('passes subject and html to Messages', () => {
      const { send } = makeTransport();
      const result = send({ from: 'f@example.com', to: 'r@example.com', subject: 'Welcome', html: '<p>Hello</p>' });
      expect(result.Messages[0].Subject).to.equal('Welcome');
      expect(result.Messages[0].HTMLPart).to.equal('<p>Hello</p>');
    });

  });

});
