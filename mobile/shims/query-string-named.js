// Metro ESM-interop shim.
// expo-router's compiled CJS forks (build/fork/getPathFromState.js and
// getPathFromState-forks.js) do `require('query-string')`. query-string v9 is
// pure ESM whose only top-level export is `default` (the namespace object),
// and Metro hands its importers a synthetic interop module exposing ONLY that
// default, so `queryString.stringify` is undefined at runtime and the release
// app crashes on the first navigation into any route with params (including
// the startup auth-gate redirect). metro.config.js redirects the fork requires
// here; this file imports the REAL default by relative file path (bypassing
// the package "exports" map) and re-exports its members as real own named
// exports, which survive for the CJS consumer.
import queryString from '../node_modules/query-string/index.js';

export const parse = queryString.parse;
export const stringify = queryString.stringify;
export const parseUrl = queryString.parseUrl;
export const stringifyUrl = queryString.stringifyUrl;
export const pick = queryString.pick;
export const exclude = queryString.exclude;
export default queryString;
