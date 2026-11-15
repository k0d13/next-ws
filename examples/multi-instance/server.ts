import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { dev: { type: 'boolean', default: false }, port: { type: 'string', default: '3000' } },
});
const dev = values.dev;
const port = Number(values.port);
const hostname = process.env.HOSTNAME ?? 'localhost';

if (!process.env.NODE_ENV) Reflect.set(process.env, 'NODE_ENV', dev ? 'development' : 'production');
// Name this instance so the page can show which one it is talking to
process.env.INSTANCE_NAME ??= `:${port}`;
// Two dev servers cannot share a build directory, production servers share one build
if (dev) process.env.NEXT_DIST_DIR ??= `.next/instance-${port}`;
// The `next` CLI sets this up itself, a custom server has to do it before Next.js loads
Reflect.set(globalThis, 'AsyncLocalStorage', AsyncLocalStorage);

const { default: next } = await import('next');
const { setHttpServer, setWebSocketServer } = await import('next-ws/server');
const { WebSocketServer } = await import('ws');

const httpServer = createServer();
setHttpServer(httpServer);
setWebSocketServer(new WebSocketServer({ noServer: true }));

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

httpServer.on('request', (req, res) => handle(req, res));
httpServer.listen(port, hostname, () => {
  console.log(`> Instance ${process.env.INSTANCE_NAME} ready on http://${hostname}:${port}`);
});
