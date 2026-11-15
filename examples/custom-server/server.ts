import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';

const dev = process.argv.includes('--dev');
if (!process.env.NODE_ENV) Reflect.set(process.env, 'NODE_ENV', dev ? 'development' : 'production');
// The `next` CLI sets this up itself, a custom server has to do it before Next.js loads
Reflect.set(globalThis, 'AsyncLocalStorage', AsyncLocalStorage);

const { default: next } = await import('next');
const { setHttpServer, setWebSocketServer } = await import('next-ws/server');
const { WebSocketServer } = await import('ws');

const hostname = process.env.HOSTNAME ?? 'localhost';
const port = Number(process.env.PORT ?? 3000);

const httpServer = createServer();
const wsServer = new WebSocketServer({ noServer: true });
// Hand both servers to next-ws before Next.js starts, so it attaches to them
setHttpServer(httpServer);
setWebSocketServer(wsServer);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

httpServer.on('request', (req, res) => {
  // Anything not handled here falls through to Next.js
  if (req.url === '/healthz') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, sockets: wsServer.clients.size }));
  }
  return handle(req, res);
});

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port} (${dev ? 'development' : 'production'})`);
});

// Close sockets with a proper code on shutdown, so clients know to reconnect elsewhere
function shutdown() {
  for (const client of wsServer.clients) client.close(1001, 'Server shutting down');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
