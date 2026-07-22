const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  org: '4first-technologies-limited',
  project: 'gas-monitor-admin',
  silent: true,
  widenClientFileUpload: true,
});
