# WebSocket proxy

Forwards WebSocket connections from a Next.js route to another WebSocket server, such as an internal service you don't want to expose directly.

- **Catch-all routes.** [`app/api/proxy/[...path]/route.ts`](app/api/proxy/[...path]/route.ts) keeps the rest of the path and the query string, so `/api/proxy/a/b?c=d` connects to `/a/b?c=d` upstream.
- **A fixed upstream.** The upstream comes from `UPSTREAM_URL`, never from the request, because the `Host` header is chosen by the caller. Without it, the proxy connects to the stand-in server in [`app/api/upstream/[...path]/route.ts`](app/api/upstream/[...path]/route.ts).
- **Backpressure.** Messages sent before the upstream connects are held up to a limit, and each side stops reading while the other has too much waiting to be written.
- **Closing both sides.** When either side closes, the other closes with the same code where the protocol allows it.

## Running it

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and send a message. It goes through the proxy to the upstream, which echoes it back.

To proxy a real server, set `UPSTREAM_URL`:

```bash
UPSTREAM_URL=wss://example.com pnpm dev
```
