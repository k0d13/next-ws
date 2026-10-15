// next-ws reads the adapter when the first client joins a room, and waits for this to finish
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { setAdapter } = await import('next-ws/server');
  const { BrokerAdapter, RedisAdapter } = await import('./adapters.mjs');
  const adapter = process.env.REDIS_URL ? new RedisAdapter() : new BrokerAdapter();
  await adapter.connect();
  setAdapter(adapter);
}
