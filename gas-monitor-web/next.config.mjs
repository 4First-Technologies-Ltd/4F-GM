import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default withSentryConfig(nextConfig, {
  org: '4first-technologies-limited',
  project: 'gas-monitor-web',
  silent: true,
  widenClientFileUpload: true,
});
