export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Next.js 16 writes AGENTS.md into the project otherwise
  agentRules: false,
  // Tests connect to 127.0.0.1, which dev resources such as HMR otherwise refuse
  allowedDevOrigins: ['127.0.0.1'],
  // Loaded from instrumentation.js, which Next.js would otherwise bundle
  serverExternalPackages: ['ioredis', 'ws'],
};
