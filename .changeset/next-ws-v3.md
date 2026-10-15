---
'next-ws': major
---

Require Next.js 15.0.0 or later, Node.js 20.9 or later and ws 8 or later, remove the deprecated `SOCKET` handler and `next-ws/client` entry, and ship an ESM build alongside CommonJS.

Replace the adapter's automatic relaying with rooms. Clients join rooms with `join()`, and `broadcast()` sends to a room on every instance through the adapter, which now only carries what is broadcast. `getClients()` lists a room's local clients.

`context.params` in `UPGRADE` is now a promise, like in route handlers, so Next.js's own `RouteContext` type fits it. Its values can still be read without awaiting.

`headers()` and `cookies()` resolve to a promise inside `UPGRADE`, as they do everywhere else in Next.js.
