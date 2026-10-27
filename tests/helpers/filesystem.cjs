'use strict';

const fs = require('node:fs/promises');

// Fail matching renames while leaving all other filesystem operations intact.
function failRenames(t, {destination, message, count = 1, when = async () => true}) {
  const rename = fs.rename;
  let remaining = count;
  fs.rename = async (from, to) => {
    if (remaining > 0 && to === destination && await when(from)) {
      remaining--;
      throw new Error(message);
    }
    return rename(from, to);
  };
  t.after(() => { fs.rename = rename; });
}

module.exports = {failRenames};
