# Live dashboard

A dashboard of the server's own CPU, memory and event loop delay, pushed to the browser every second, plus announcements that reach every open dashboard at once.

- **Server push.** The browser never asks for data. [`lib/sampler.ts`](lib/sampler.ts) measures the server once a second, but only while someone is watching, and sends one sample to every viewer.
- **Cleaning up.** Each socket removes itself on `close`, and sampling stops when the last viewer leaves, so nothing runs for clients that are gone.
- **Pushing from a server action.** [`app/actions.ts`](app/actions.ts) sends announcements with `getWebSocketServer()` from `next-ws/server`. Server actions and route handlers run in the same process as the WebSocket server, so any server code can reach connected clients.

## Running it

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000) in a couple of tabs, then post an announcement from one of them.
