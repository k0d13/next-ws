'use client';

import { useWebSocket, WebSocketProvider } from 'next-ws/client';
import { useEffect, useState } from 'react';

// Used by tests to check the provider exposes its socket and keeps it across re-renders

const socketIds = new WeakMap<WebSocket, number>();
let nextSocketId = 0;

function Status() {
  const socket = useWebSocket();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!socket) return;
    const onMessage = (event: MessageEvent) =>
      setMessage(JSON.parse(event.data).content);
    socket.addEventListener('message', onMessage);
    return () => socket.removeEventListener('message', onMessage);
  }, [socket]);

  if (socket && !socketIds.has(socket)) socketIds.set(socket, ++nextSocketId);

  return (
    <dl>
      <dt>Socket</dt>
      <dd id="socket">{socket ? socketIds.get(socket) : 'none'}</dd>
      <dt>Message</dt>
      <dd id="message">{message ?? 'none'}</dd>
    </dl>
  );
}

export default function Page() {
  const [renders, setRenders] = useState(0);
  const [url, setUrl] = useState<string>();
  useEffect(() => setUrl(`ws://${window.location.host}/api/ws`), []);

  if (!url) return null;
  return (
    // Inline protocols array is intentional, a new array every render
    <WebSocketProvider url={url} protocols={['chat']}>
      <button type="button" onClick={() => setRenders((r) => r + 1)}>
        Re-render ({renders})
      </button>
      <Status />
    </WebSocketProvider>
  );
}
