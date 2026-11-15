---
'next-ws': minor
---

Hold messages a client sends before `UPGRADE` listens for them, read the adapter and WebSocket server when they are first needed so `instrumentation.ts` can set them, wait for Next.js to finish starting before handling upgrades, leave unmatched upgrades to a custom server's own listeners, abort `request.signal` when the connection closes, match routes the way Next.js does (including parameter names such as `[post-id]`) and cache them in production
