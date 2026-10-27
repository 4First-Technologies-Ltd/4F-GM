/**
 * Wraps app.json. The only thing computed here is the Firebase config for Android push.
 *
 * `google-services.json` is not committed (a secret scanner flags the Firebase client key
 * inside it, and it is cleaner to keep project config out of git). EAS builds get it from
 * the `GOOGLE_SERVICES_JSON` file variable (set with `eas env:create --type file`), which
 * EAS exposes as a path; local runs fall back to the ignored `./google-services.json`.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
