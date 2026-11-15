# Multi-instance

Live reactions shared between two Next.js servers through Redis.

Behind a load balancer, two people in the same room can land on different servers. An adapter connects the servers, so a message sent on one reaches clients on all of them.

- **An adapter in about 30 lines.** [`lib/redis-adapter.ts`](lib/redis-adapter.ts) implements the `Adapter` interface from `next-ws/server` on Redis pub/sub. Each room becomes a channel.
- **Set it once.** [`instrumentation.ts`](instrumentation.ts) passes the adapter to `setAdapter()` when each instance starts, before it accepts connections.
- **Rooms in the route.** [`app/api/reactions/route.ts`](app/api/reactions/route.ts) adds each client to a room with `join()`, checks every reaction, and sends it on with `broadcast()`, leaving out the sender. With the adapter, that reaches the room's clients on every instance.
- **Two instances on one machine.** [`server.ts`](server.ts) is a small custom server that gives each development instance its own port and build directory.

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
