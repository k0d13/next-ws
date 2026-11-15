# Custom server

next-ws on your own Node.js HTTP server, for when you need to handle some requests yourself.

- **Bring your own servers.** [`server.ts`](server.ts) creates the HTTP and WebSocket servers and hands them to next-ws with `setHttpServer()` and `setWebSocketServer()` before Next.js starts. Routes then use `UPGRADE` exactly as they would with `next dev` or `next start`.
- **Mixing in your own routes.** `/healthz` is answered by the server itself, and reports how many sockets are open. Everything else goes to Next.js.
- **Graceful shutdown.** On `SIGINT` or `SIGTERM`, every socket is closed with code `1001` so clients know to reconnect.

The page pings the server once a second and charts the round trip.

## Running it

```bash
pnpm install
pnpm dev
```

For production, build first and then start the server:

```bash
pnpm build
pnpm start
```
