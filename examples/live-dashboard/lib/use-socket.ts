'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SocketStatus = 'connecting' | 'open' | 'closed';

/**
 * Keep a WebSocket open to a path on this site, reconnecting with backoff when it drops.
 *
 * @param path Path of the WebSocket route, such as `/api/rooms/general`
 * @param onMessage Called with each message the server sends
 * @returns Connection status and a function to send messages
 */
export function useSocket(path: string, onMessage: (data: string) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${location.host}${path}`);
      socketRef.current = socket;
      setStatus('connecting');

      socket.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      socket.onmessage = (event) => onMessageRef.current(String(event.data));
      socket.onclose = (event) => {
        setStatus('closed');
        // 1008 means the server refused us, so retrying cannot help
        if (stopped || event.code === 1008) return;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15_000));
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [path]);

  const send = useCallback((data: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
  }, []);

  return { status, send };
}
