import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('./package.json');

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  experimental: {
    typedRoutes: false,
  },
  // Allow images from any origin (avatars, bank logos, etc.)
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Expose package.json version as a build-time env var
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default config;
