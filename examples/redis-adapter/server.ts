import { Server } from 'node:http';
import { parse } from 'node:url';
import Redis from 'ioredis';
import next from 'next';
import {
  type Adapter,
  setAdapter,
  setHttpServer,
  setWebSocketServer,
} from 'next-ws/server';
import { WebSocketServer } from 'ws';

class RedisAdapter implements Adapter {
  private pub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private handlers = new Map<string, Set<(message: unknown) => void>>();

  constructor() {
    this.sub.on('message', (channel: string, msg: string) => {
      const roomHandlers = this.handlers.get(channel);
      if (!roomHandlers) return;
      for (const handler of roomHandlers) handler(msg);
    });
  }

  async broadcast(room: string, message: unknown): Promise<void> {
    const messageStr =
      typeof message === 'string'
        ? message
        : Buffer.isBuffer(message)
          ? message.toString('utf-8')
          : JSON.stringify(message);
    await this.pub.publish(room, messageStr);
  }

  async onMessage(
    room: string,
    handler: (message: unknown) => void,
  ): Promise<void> {
    if (!this.handlers.has(room)) {
      this.handlers.set(room, new Set());
      await this.sub.subscribe(room);
    }
    this.handlers.get(room)?.add(handler);
  }

  async close(): Promise<void> {
    await Promise.all([this.pub.quit(), this.sub.quit()]);
  }
}

const httpServer = new Server();
setHttpServer(httpServer);
const webSocketServer = new WebSocketServer({ noServer: true });
setWebSocketServer(webSocketServer);
setAdapter(new RedisAdapter());

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const app = next({ dev, hostname, port, customServer: true });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  httpServer
    .on('request', async (req, res) => {
      if (!req.url) return;
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[next-ws] request handler error:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      }
    })
    .listen(port, () => {
      console.log(
        ` ▲ Ready on http://${hostname}:${port} (Instance ${process.env.INSTANCE_ID || 'unknown'})`,
      );
    });
});
