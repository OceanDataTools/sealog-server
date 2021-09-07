const Crypto = require('crypto');
const Fs = require('fs');

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

const rmDir = (dirPath) => {

  try {
    const files = Fs.readdirSync(dirPath); 

    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const filePath = dirPath + '/' + files[i];
        if (Fs.statSync(filePath).isFile()) {
          Fs.unlinkSync(filePath);
        }
        else {
          rmDir(filePath);
        }
      }
    }
  }
  catch (err) {
    console.log(err);
    throw err; 
  }

  try {
    Fs.rmdirSync(dirPath);
  }
  catch (err) {
    console.log(err);
    throw err;
  }
};

const mvFilesToDir = (sourceDirPath, destDirPath) => {

  try {
    const files = Fs.readdirSync(sourceDirPath); 
    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const sourceFilePath = sourceDirPath + '/' + files[i];
        const destFilePath = destDirPath + '/' + files[i];
        if (Fs.statSync(sourceFilePath).isFile()) {
          try {
            Fs.renameSync(sourceFilePath, destFilePath );
          }
          catch (error) {
            if (error.code === 'EXDEV') {
              Fs.copyFileSync(sourceFilePath, destFilePath );
              Fs.unlinkSync(sourceFilePath );
            }
          }
        }
        else {
          mvFilesToDir(sourceFilePath, destFilePath);
        }
      }
    }
  }
  catch (err) {
    console.log(err);
    throw err;
  }

  try {
    Fs.rmdirSync(sourceDirPath);
  }
  catch (err) {
    console.log(err);
    throw err;
  }
};

const array_move = (arr, old_index, new_index) => {

  if (new_index >= arr.length) {
    let k = new_index - arr.length + 1;
    while (k--) {
      arr.push(undefined);
    }
  }

  arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
  return arr; // for testing
};

module.exports = {
  randomString,
  randomAsciiString,
  rmDir,
  mvFilesToDir,
  array_move
};

