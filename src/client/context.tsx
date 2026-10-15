'use client';

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

export const WebSocketContext = createContext<WebSocket | null>(null);
WebSocketContext.displayName = 'WebSocketContext';
export const WebSocketConsumer = WebSocketContext.Consumer;

/**
 * Provides a WebSocket client to its children via context, allowing for easy access to the
 * WebSocket from anywhere in the app.
 *
 * @deprecated `WebSocketProvider` is deprecated, use your own implementation instead.
 * @param props WebSocket parameters and children.
 * @returns JSX Element
 */
export function WebSocketProvider(
  p: PropsWithChildren<{
    /** The URL for the WebSocket to connect to. */
    url: string;
    /** The subprotocols to use. */
    protocols?: string[] | string;
    /** The binary type to use. */
    binaryType?: BinaryType;
  }>,
) {
  const [client, setClient] = useState<WebSocket | null>(null);

  // Compare protocols by value so an inline array doesn't reconnect every render,
  // subprotocol tokens cannot contain commas so joining is lossless
  const protocols = Array.isArray(p.protocols) ? p.protocols.join(',') : p.protocols;

  useEffect(() => {
    const client = new WebSocket(p.url, protocols ? protocols.split(',') : undefined);
    if (p.binaryType) client.binaryType = p.binaryType;
    setClient(client);

    return () => {
      client.close();
      setClient(null);
    };
  }, [p.url, protocols, p.binaryType]);

  return <WebSocketContext.Provider value={client}>{p.children}</WebSocketContext.Provider>;
}

/**
 * Access the websocket from anywhere in the app, so long as it's wrapped in a WebSocketProvider.
 *
 * @deprecated `useWebSocket` is deprecated, use your own implementation instead.
 * @returns WebSocket client when connected, null when disconnected.
 */
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined)
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  return context;
}
