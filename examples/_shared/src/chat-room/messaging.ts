'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from '../websocket';

export interface Message {
  author: string;
  content: string;
}

export function useMessaging(url: () => string) {
  const socket = useWebSocket(url);

  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    socket?.addEventListener(
      'message',
      async (event) => {
        const payload = typeof event.data === 'string' ? event.data : await event.data.text();
        const message = JSON.parse(payload) as Message;
        console.log('Incoming message:', message);
        setMessages((p) => [...p, message]);
      },
      controller,
    );

    socket?.addEventListener(
      'error',
      () => {
        const content = 'An error occurred while connecting to the server';
        setMessages((p) => [...p, { author: 'System', content }]);
      },
      controller,
    );

    socket?.addEventListener(
      'close',
      (event) => {
        if (event.wasClean) return;
        const content = 'The connection to the server was closed unexpectedly';
        setMessages((p) => [...p, { author: 'System', content }]);
      },
      controller,
    );

    return () => controller.abort();
  }, [socket]);

  const sendMessage = useCallback(
    (message: Message) => {
      if (!socket || socket.readyState !== socket.OPEN) return;
      console.log('Outgoing message:', message);
      socket.send(JSON.stringify(message));
      setMessages((p) => [...p, { ...message, author: 'You' }]);
    },
    [socket],
  );

  return [messages, sendMessage] as const;
}
