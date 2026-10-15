---
"next-ws": patch
---

Fix `WebSocketProvider` not exposing its socket until a re-render, and reconnecting on every render when given an inline `protocols` array
