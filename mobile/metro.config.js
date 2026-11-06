const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable watchman so Metro uses Node.js native filesystem watcher (forceNodeFilesystemAPI: true).
// This eliminates the macOS TCC "Operation not permitted" error on ~/Downloads.
config.resolver.useWatchman = false;

// query-string v9 is pure ESM ("default"-only export condition). Metro's CJS
// interop for such packages drops named exports, which breaks expo-router's
// compiled CJS forks that call queryString.stringify at runtime (startup crash
// on any navigation into a route with params). Redirect ONLY those fork
// requires to an ESM re-export shim that preserves the named exports.
const queryStringShim = path.resolve(__dirname, 'shims/query-string-named.js');
const forkDir = `${path.sep}expo-router${path.sep}build${path.sep}fork${path.sep}`;
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'query-string' &&
    context.originModulePath &&
    context.originModulePath.includes(forkDir)
  ) {
    return { type: 'sourceFile', filePath: queryStringShim };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
