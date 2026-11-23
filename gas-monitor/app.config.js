const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Wraps app.json. Computed here:
 *  - the Firebase config for Android push, and
 *  - the portrait feature declaration (see withOptionalPortrait).
 *
 * `google-services.json` is not committed (a secret scanner flags the Firebase client key
 * inside it, and it is cleaner to keep project config out of git). EAS builds get it from
 * the `GOOGLE_SERVICES_JSON` file variable (set with `eas env:create --type file`), which
 * EAS exposes as a path; local runs fall back to the ignored `./google-services.json`.
 */

/**
 * The app is locked to portrait, and Android turns that into a *required* hardware feature
 * (`android.hardware.screen.portrait`). Play then hides the app from every device without a
 * portrait screen (tablets, desktops, Android XR) and blocks the release. Declaring the
 * feature as not required keeps the portrait lock but lets those devices install the app.
 */
function withOptionalPortrait(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    const features = (manifest['uses-feature'] = manifest['uses-feature'] ?? []);
    const name = 'android.hardware.screen.portrait';
    const existing = features.find((f) => f.$ && f.$['android:name'] === name);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    return c;
  });
}

module.exports = ({ config }) =>
  withOptionalPortrait({
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
  });
