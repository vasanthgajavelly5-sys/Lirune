/**
 * On Windows, some electron-builder child operations pass custom env objects
 * (e.g. __COMPAT_LAYER: 'RunAsInvoker') which drop critical system environment
 * variables like SystemRoot and PATH if not merged, causing spawn UNKNOWN errors.
 * This hook ensures system variables are preserved when executing binaries.
 */
const cp = require('child_process');
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
}
