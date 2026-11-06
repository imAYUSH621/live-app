// Metro ESM-interop shim.
// expo-router's compiled CJS forks (build/fork/getPathFromState.js and
// getPathFromState-forks.js) do `require('query-string')`. query-string v9 is
// pure ESM with only a "default" export condition, so Metro substitutes a
// wildcard-interop module that re-exports ONLY `default`. The TS __importStar
// helper then returns that module unchanged (`__esModule: true`), leaving
// `queryString.stringify` undefined at runtime -> TypeError: undefined is not
// a function on the first navigation into any route with params (including the
// startup auth-gate redirect), which kills the release app at launch.
// metro.config.js redirects those fork requires to this file; because this is
// an ESM re-export compiled by babel, named exports survive for CJS consumers.
export * from 'query-string';
export { default } from 'query-string';
