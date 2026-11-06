const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable watchman so Metro uses Node.js native filesystem watcher (forceNodeFilesystemAPI: true).
// This eliminates the macOS TCC "Operation not permitted" error on ~/Downloads.
config.resolver.useWatchman = false;

// query-string v9 is pure ESM ("default"-only export condition). Its namespace therefore lacks named exports for the compiled CJS
// importer, which breaks expo-router's
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
  // @expo/metro-runtime (location/install.native.ts) lazily requires
  // 'web-streams-polyfill/ponyfill/es6' inside try{}. web-streams-polyfill v4's
  // exports map dropped that subpath, so Metro silently omits the dependency
  // and the lazy global.ReadableStream getter throws
  // "Requiring unknown module undefined" on first access - which aborts
  // LiveKit's registerGlobals (caught by our root layout's guard, leaving the
  // later registration steps incomplete). v4's package main IS the ponyfill,
  // so alias the removed subpath to the package root.
  if (moduleName === 'web-streams-polyfill/ponyfill/es6') {
    return context.resolveRequest(context, 'web-streams-polyfill', platform);
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
