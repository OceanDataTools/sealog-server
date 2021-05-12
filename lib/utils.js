const Crypto = require('crypto');

const randomString = (length, chars) => {

  if (!chars) {
    throw new Error('Argument \'chars\' is undefined');
  }

  const charsLength = chars.length;
  if (charsLength > 256) {
    throw new Error('Argument \'chars\' should not have more than 256 characters'
      + ', otherwise unpredictability will be broken');
  }

  const randomBytes = Crypto.randomBytes(length);
  const result = new Array(length);

  let cursor = 0;
  for (let i = 0; i < length; ++i) {
    cursor += randomBytes[i];
    result[i] = chars[cursor % charsLength];
  }

  return result.join('');
};

const randomAsciiString = (length) => {

  return randomString(length,
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
};

module.exports = {
  randomString,
  randomAsciiString
};
