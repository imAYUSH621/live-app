const { withAppBuildGradle } = require('@expo/config-plugins');

// react-native-iap publishes `amazon` and `play` store flavors; the app must pick one
// or Android builds fail with "cannot choose between variants amazon/play".
module.exports = function withStoreFlavor(config) {
  return withAppBuildGradle(config, (c) => {
    const marker = "missingDimensionStrategy 'store', 'play'";
    if (!c.modResults.contents.includes(marker)) {
      c.modResults.contents = c.modResults.contents.replace(
        /(defaultConfig\s*\{)/,
        `$1\n        ${marker}`
      );
    }
    return c;
  });
};
