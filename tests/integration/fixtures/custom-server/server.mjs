import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';

// Next.js sets this up in its own CLI, custom servers have to do it before importing next
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

const { default: next } = await import('next');
const { setHttpServer, setWebSocketServer } = await import('next-ws/server');
const { WebSocketServer } = await import('ws');

const port = Number(process.env.PORT);
const app = next({ dev: process.env.NODE_ENV !== 'production', hostname: '127.0.0.1', port });
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => {
  if (req.url === '/health') return res.end('ok');
  return handle(req, res);
});
httpServer.customServer = true;
setHttpServer(httpServer);
setWebSocketServer(new WebSocketServer({ noServer: true }));

await app.prepare();
httpServer.listen(port, '127.0.0.1');
