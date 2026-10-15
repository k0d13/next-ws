<div align='center'>
  <h1><strong>Next WS</strong></h1>
  <i>Add support for WebSockets in Next.js app directory</i><br>
  <code>npm install next-ws ws</code>
</div>

<div align='center'>
  <img alt='package version' src='https://img.shields.io/npm/v/next-ws?label=version'>
  <img alt='total downloads' src='https://img.shields.io/npm/dt/next-ws'>
  <br>
  <a href='https://github.com/k0d13/next-ws'><img alt='next-ws repo stars' src='https://img.shields.io/github/stars/k0d13/next-ws?style=social'></a>
  <a href='https://github.com/k0d13'><img alt='k0d13 followers' src='https://img.shields.io/github/followers/k0d13?style=social'></a>
  <a href='https://discord.gg/B2rEQ9g2vf'><img src='https://discordapp.com/api/guilds/829836158007115806/widget.png?style=shield' alt='discord shield'/></a>
</div>

## 🤔 About

`next-ws` is a simple package that adds WebSocket support to your Next.js app directory. With `next-ws`, you no longer need to create a separate WebSocket server to handle WebSocket connections. Instead, you can handle WebSocket connections directly in your Next.js API routes.

> [!IMPORTANT]  
> Next WS is designed for use in server-based environments. It is not suitable for serverless platforms like Vercel, where WebSocket servers are not supported. Furthermore, this plugin is built for the app directory and does not support the older pages directory.

## 🏓 Table of Contents

- [📦 Installation](#-installation)
- [🚀 Usage](#-usage)
- [🌀 Examples](#-examples)
- [🔒 HTTPS and `wss://`](#-https-and-wss)
- [🧪 Development](#-development)

## 📦 Installation

next-ws supports Next.js 15 and later.

To set up a WebSocket server with `next-ws`, you need to patch your local Next.js installation. `next-ws` simplifies this process by providing a CLI command that handles the patching for you. Follow these steps to get started:

1. **Install Dependencies**: Use your preferred package manager to install `next-ws` and its peer dependency `ws`:

   ```bash
   npm install next-ws ws
   pnpm add next-ws ws
   yarn add next-ws ws
   ```

2. **Add Prepare Script**: Add the following `prepare` script to your `package.json`. The `prepare` script is a lifecycle script that runs automatically when you run `npm install`, ensuring that your Next.js installation is patched with `next-ws` every time you install it:

   ```json
   {
     "scripts": {
       "prepare": "next-ws patch"
     }
   }
   ```

## 🚀 Usage

Handle WebSocket connections in any route file in the app directory by exporting an `UPGRADE` function. It runs once for each new connection.

```ts
// app/api/ws/route.ts

import type { RouteContext } from 'next-ws/server';
import type { NextRequest } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';

export function UPGRADE(
  client: WebSocket,
  server: WebSocketServer,
  request: NextRequest,
  context: RouteContext<'/api/ws'>,
) {
  client.on('message', (message) => client.send(message));
}
```

| Argument  | What it is                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- |
| `client`  | The connection, a `WebSocket` from [`ws`](https://github.com/websockets/ws).                |
| `server`  | The `WebSocketServer` every connection belongs to, `server.clients` lists all of them.      |
| `request` | The upgrade request as a `NextRequest`, with its URL, headers and cookies.                  |
| `context` | Route parameters in `context.params`, such as `{ room: 'general' }` for `/rooms/[room]/ws`. |

Requests to a path without a matching route, or to a route without `UPGRADE`, are refused with a `404`. If `UPGRADE` throws, the connection is closed with code `1011`.

### Headers and cookies

`headers()` and `cookies()` from `next/headers` work inside `UPGRADE`, and inside any event listener it adds, so authentication works the way it does in a page:

```ts
import { cookies } from 'next/headers';

export async function UPGRADE(client: WebSocket) {
  const session = await getSession((await cookies()).get('session')?.value);
  if (!session) return client.close(1008, 'Unauthorised');
  // ...
}
```

### Sending from anywhere on the server

Server actions and route handlers run in the same process as the WebSocket server, so they can reach connected clients with `getWebSocketServer()`:

```ts
'use server';

import { getWebSocketServer } from 'next-ws/server';

export async function announce(text: string) {
  for (const client of getWebSocketServer()?.clients ?? []) client.send(text);
}
```

### Custom servers

With a custom server, create the HTTP and WebSocket servers yourself and hand them to next-ws before Next.js starts:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import next from 'next';
import { setHttpServer, setWebSocketServer } from 'next-ws/server';
import { WebSocketServer } from 'ws';

// The `next` CLI sets this up itself, a custom server has to do it too
globalThis.AsyncLocalStorage = AsyncLocalStorage;

const httpServer = createServer();
setHttpServer(httpServer);
setWebSocketServer(new WebSocketServer({ noServer: true }));

const app = next({ dev: process.env.NODE_ENV !== 'production' });
await app.prepare();
httpServer.on('request', app.getRequestHandler()).listen(3000);
```

### Running several instances

Clients connected to different servers cannot see each other. An adapter connects the servers through a message broker, such as Redis pub/sub. Set one with `setAdapter()` in a custom server, and every message a client sends then reaches the other clients on the same route, on every instance, without the sender getting it back.

An adapter implements four methods, and only ever handles strings:

```ts
import type { Adapter } from 'next-ws/server';

class RedisAdapter implements Adapter {
  broadcast(room: string, message: string) {} // Publish to every instance
  subscribe(room: string, handler: (message: string) => void) {} // Start receiving a room
  unsubscribe(room: string) {} // Stop, once the last local client has left
  close() {} // Clean up connections
}
```

See the [multi-instance example](https://github.com/k0d13/next-ws/tree/main/examples/multi-instance) for a complete Redis adapter.

## 🌀 Examples

Each example is a complete app you can copy.

| Example                                                                                | Shows                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Chat](https://github.com/k0d13/next-ws/tree/main/examples/chat)                       | Rooms from route params, sessions from cookies, presence, typing, reconnects. |
| [Live dashboard](https://github.com/k0d13/next-ws/tree/main/examples/live-dashboard)   | Server push on an interval, cleaning up, sending from a server action.        |
| [Custom server](https://github.com/k0d13/next-ws/tree/main/examples/custom-server)     | Your own HTTP server, extra routes and graceful shutdown.                     |
| [Multi-instance](https://github.com/k0d13/next-ws/tree/main/examples/multi-instance)   | Sharing rooms between servers with a Redis adapter.                           |
| [WebSocket proxy](https://github.com/k0d13/next-ws/tree/main/examples/websocket-proxy) | Forwarding connections to another WebSocket server from a catch-all route.    |

## 🔒 HTTPS and `wss://`

Next WS doesn't handle TLS itself. It listens for upgrade requests on the same HTTP server that Next.js uses, so `wss://` works whenever that server is reachable over HTTPS.

**Reverse proxy (recommended):** terminate TLS in nginx, Caddy or your load balancer and forward to `next start` over plain HTTP. Make sure the proxy forwards the `Upgrade` and `Connection` headers.

**Custom server:** create an HTTPS server with your certificate and hand it to Next WS. See the [custom server example](https://github.com/k0d13/next-ws/tree/main/examples/custom-server) for the full setup.

```ts
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { setHttpServer } from 'next-ws/server';

const httpsServer = createServer({
  key: readFileSync('key.pem'),
  cert: readFileSync('cert.pem'),
});
setHttpServer(httpsServer);
```

## 🧪 Development

```bash
pnpm install
pnpm test:unit         # Unit tests and patch snapshots against real Next.js releases
pnpm test:integration  # Real Next.js apps in dev and production, over real WebSockets
pnpm check             # Types, lint, format and unused code
```

The integration tests use Redis when `REDIS_URL` is set, and a small stand-in broker otherwise.
