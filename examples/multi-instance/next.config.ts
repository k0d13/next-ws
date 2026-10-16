import type { NextConfig } from 'next';

const config: NextConfig = {
  // server.ts gives each development instance its own build directory
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
