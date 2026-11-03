const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable watchman so Metro uses Node.js native filesystem watcher (forceNodeFilesystemAPI: true).
// This eliminates the macOS TCC "Operation not permitted" error on ~/Downloads.
config.resolver.useWatchman = false;

module.exports = config;

