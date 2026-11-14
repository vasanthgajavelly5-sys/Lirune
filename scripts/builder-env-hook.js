/**
 * Preserves Windows system variables for electron-builder child processes and
 * retries transient file locks from antivirus/indexing during packaging.
 */
const childProcess = require('node:child_process');
const fs = require('node:fs');

if (process.platform === 'win32') {
  const originalExecFile = childProcess.execFile;
  childProcess.execFile = function execFile(file, args, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (Array.isArray(args) && options && typeof options === 'object' && options.env) {
      if (!options.env.SystemRoot && !options.env.SYSTEMROOT) {
        options.env = { ...process.env, ...options.env };
      }
    }
    return originalExecFile.call(this, file, args, options, callback);
  };

  if (fs.promises && typeof fs.promises.writeFile === 'function') {
    const originalWriteFile = fs.promises.writeFile;
    fs.promises.writeFile = async function writeFile(file, data, options) {
      let attempts = 15;
      while (attempts > 0) {
        try {
          return await originalWriteFile.call(fs.promises, file, data, options);
        } catch (error) {
          if ((error.code === 'EBUSY' || error.code === 'EPERM') && attempts > 1) {
            attempts -= 1;
            await new Promise((resolve) => setTimeout(resolve, 600));
          } else {
            throw error;
          }
        }
      }
      throw new Error('Unable to write packaging output after retries');
    };
  }
}
