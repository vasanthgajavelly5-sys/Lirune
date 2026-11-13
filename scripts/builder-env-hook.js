/**
 * On Windows, some electron-builder child operations pass custom env objects
 * (e.g. __COMPAT_LAYER: 'RunAsInvoker') which drop critical system environment
 * variables like SystemRoot and PATH if not merged, causing spawn UNKNOWN errors.
 * Additionally, Windows Defender / Search Indexer locks newly extracted binaries
 * temporarily for scanning, causing transient EBUSY / EPERM failures in resEdit.
 * This hook ensures system variables are preserved when executing binaries and
 * retries transient file locks when writing PE executable resources.
 */
const cp = require('child_process');
const fs = require('fs');

if (process.platform === 'win32') {
  const origExecFile = cp.execFile;
  cp.execFile = function(file, args, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (Array.isArray(args)) {
      if (options && typeof options === 'object' && options.env) {
        if (!options.env.SystemRoot && !options.env.SYSTEMROOT) {
          options.env = { ...process.env, ...options.env };
        }
      }
    }
    return origExecFile.call(this, file, args, options, callback);
  };

  if (fs.promises && typeof fs.promises.writeFile === 'function') {
    const origWriteFile = fs.promises.writeFile;
    fs.promises.writeFile = async function(file, data, options) {
      let attempts = 15;
      while (attempts > 0) {
        try {
          return await origWriteFile.call(fs.promises, file, data, options);
        } catch (err) {
          if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempts > 1) {
            attempts--;
            await new Promise(resolve => setTimeout(resolve, 600));
          } else {
            throw err;
          }
        }
      }
    };
  }
}
