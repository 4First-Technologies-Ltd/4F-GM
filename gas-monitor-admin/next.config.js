const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone'
};

/**
 * `NEXT_PUBLIC_API_URL` is inlined into the client bundle at BUILD time. If it is
 * missing during a production build, `lib/api.ts` falls back to
 * http://localhost:9000 and the deployed admin silently fails every request with
 * ERR_CONNECTION_REFUSED — with no server-side signal that anything is wrong.
 *
 * Fail the build instead. Checked only in the build phase: at `next start` the
 * value is already baked into the bundle and is legitimately absent from the
 * runtime environment.
 */
module.exports = (phase) => {
  if (phase === 'phase-production-build' && !process.env.NEXT_PUBLIC_API_URL) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set.\n' +
        '\n' +
        'It is baked into the client bundle at build time, so it must be present\n' +
        'in the build environment — not just at runtime.\n' +
        '\n' +
        '  local     add it to .env.local (already gitignored)\n' +
        '  Netlify   Site settings -> Environment variables (scope: Builds)\n' +
        '  Docker    docker build --build-arg NEXT_PUBLIC_API_URL=https://...\n' +
        '\n' +
        'Production value: https://ugo.4fgmonitor.com'
    );
  }

  return withSentryConfig(nextConfig, {
    org: '4first-technologies-limited',
    project: 'gas-monitor-admin',
    silent: true,
    widenClientFileUpload: true
  });
};
