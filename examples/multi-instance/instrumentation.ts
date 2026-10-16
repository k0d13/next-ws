/**
 * Runs once when each instance starts, before it accepts WebSocket connections, so it is where the
 * adapter is set. No custom server is needed for this.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { setAdapter } = await import('next-ws/server');
  const { RedisAdapter } = await import('./lib/redis-adapter');
  setAdapter(new RedisAdapter(process.env.REDIS_URL ?? 'redis://localhost:6379'));
}
