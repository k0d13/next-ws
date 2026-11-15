# Chat

Real-time chat rooms with presence and typing indicators.

- **Sessions from cookies.** A server action keeps your name in a cookie, and the WebSocket route reads it with `cookies()` from `next/headers`, the same way a page would. Sockets without a name are closed with code `1008`.
- **Rooms from route params.** [`app/api/rooms/[room]/route.ts`](app/api/rooms/[room]/route.ts) gets the room from `context.params`, typed with the `RouteContext` Next.js generates, the same as any route handler.
- **A typed protocol.** [`lib/protocol.ts`](lib/protocol.ts) defines every message in both directions, and validates what the browser sends, because anything from a client is untrusted.
- **Reconnects.** [`lib/use-socket.ts`](lib/use-socket.ts) reconnects with exponential backoff, and stops when the server refuses the connection.

Room state lives in memory on one server. To run several instances, see the [multi-instance example](../multi-instance).

## Running it

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000) in two browsers, pick different names, and join the same room.
