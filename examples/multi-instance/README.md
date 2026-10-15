# Multi-instance

Live reactions shared between two Next.js servers through Redis.

Behind a load balancer, two people in the same room can land on different servers. An adapter connects the servers, so a message sent on one reaches clients on all of them.

- **An adapter in about 30 lines.** [`lib/redis-adapter.ts`](lib/redis-adapter.ts) implements the `Adapter` interface from `next-ws/server` on Redis pub/sub. Each room, which is a route pathname, becomes a channel.
- **Set it once.** [`server.ts`](server.ts) passes the adapter to `setAdapter()` before Next.js starts. From then on, every message a client sends reaches the other clients in its room, on every instance. The sender does not get its own message back.
- **Nothing in the route.** [`app/api/reactions/route.ts`](app/api/reactions/route.ts) only says hello, because the adapter does the relaying.

## Running it

Start Redis, or set `REDIS_URL` to one you already have:

```bash
pnpm redis
```

Then start two instances, each in its own terminal:

```bash
pnpm dev
```

```bash
pnpm dev:second
```

Open [localhost:3000](http://localhost:3000) and [localhost:3001](http://localhost:3001) side by side and react in either one.
