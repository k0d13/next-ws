import { WebSocket } from 'ws';

export function GET() {
  const headers = new Headers();
  headers.set('Connection', 'Upgrade');
  headers.set('Upgrade', 'websocket');
  return new Response('Upgrade Required', { status: 426, headers });
}

export function UPGRADE(
  client: import('ws').WebSocket,
  _server: import('ws').WebSocketServer,
  request: import('next/server').NextRequest,
  context: import('next-ws/server').RouteContext<'/api/proxy/[...path]'>,
) {
  // In a real app this would be an external server, e.g. wss://example.com,
  // here it defaults to the stand-in upstream route in this example. Never
  // build this from the request, the Host header is chosen by the caller
  const origin =
    process.env.UPSTREAM_URL ??
    `ws://localhost:${process.env.PORT ?? 3000}/api/upstream`;
  const path = context.params.path.join('/');
  const upstream = new WebSocket(`${origin}/${path}${request.nextUrl.search}`, {
    handshakeTimeout: 10_000,
  });

  // The client is connected before the upstream is, so hold its messages until
  // then, up to a limit so a stalled upstream can't use up the server's memory
  const pending: [import('ws').RawData, boolean][] = [];
  let pendingBytes = 0;
  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN)
      return forward(client, upstream, data, isBinary);

    pendingBytes += byteLength(data);
    if (pendingBytes > MAX_PENDING_BYTES) {
      pending.length = 0;
      upstream.terminate();
      return client.close(1009, 'Too many pending messages');
    }
    pending.push([data, isBinary]);
  });
  upstream.once('open', () => {
    for (const [data, isBinary] of pending.splice(0))
      upstream.send(data, { binary: isBinary });
    pendingBytes = 0;
  });

  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN)
      forward(upstream, client, data, isBinary);
  });

  // Close each side when the other closes, codes like 1005 and 1006 can't be
  // sent so only forward codes that are valid to send
  const canSend = (code: number) =>
    (code >= 1000 &&
      code <= 1014 &&
      code !== 1004 &&
      code !== 1005 &&
      code !== 1006) ||
    (code >= 3000 && code <= 4999);
  upstream.once('close', (code, reason) => {
    if (canSend(code)) client.close(code, reason);
    else client.close();
  });
  client.once('close', (code, reason) => {
    if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    else if (canSend(code)) upstream.close(code, reason);
    else upstream.close();
  });
  upstream.on('error', () => client.close(1011, 'Upstream error'));
  // Without a listener a bad frame from the client would crash the server
  client.on('error', () => upstream.terminate());
}

const MAX_PENDING_BYTES = 1024 * 1024;
const MAX_BUFFERED_BYTES = 1024 * 1024;

// Stop reading from one side while the other has too much waiting to be
// written, so a slow reader can't fill the server's memory
function forward(
  from: import('ws').WebSocket,
  to: import('ws').WebSocket,
  data: import('ws').RawData,
  isBinary: boolean,
) {
  to.send(data, { binary: isBinary }, () => {
    if (from.isPaused && to.bufferedAmount < MAX_BUFFERED_BYTES) from.resume();
  });
  if (to.bufferedAmount >= MAX_BUFFERED_BYTES) from.pause();
}

function byteLength(data: import('ws').RawData) {
  if (Array.isArray(data))
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  return data.byteLength;
}
