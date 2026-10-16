import type { NextConfig } from 'next';

const config: NextConfig = {
  // server.ts gives each development instance its own build directory
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // instrumentation.ts connects to Redis, keep the client out of the bundle
  serverExternalPackages: ['ioredis'],
};

export default config;
