'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/proxy/custom/path`,
    );
    socket.addEventListener('message', (event) =>
      setMessages((p) => [...p, String(event.data)]),
    );
    setSocket(socket);
    return () => socket.close();
  }, []);

  return (
    <div style={{ maxWidth: '50vh' }}>
      <ul>
        {messages.map((message, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are append only
          <li key={i}>{message}</li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem('message');
          if (!(input instanceof HTMLInputElement) || !input.value) return;
          if (socket?.readyState !== WebSocket.OPEN) return;
          socket.send(input.value);
          input.value = '';
        }}
      >
        <input name="message" placeholder="Message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
