/** A chat message, as stored and sent to clients. */
export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  sentAt: number;
}

/** Messages the browser sends to the server. */
export type ClientMessage = { type: 'message'; text: string } | { type: 'typing'; typing: boolean };

/** Messages the server sends to the browser. */
export type ServerMessage =
  | { type: 'welcome'; you: string; history: ChatMessage[]; members: string[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; members: string[] }
  | { type: 'typing'; name: string; typing: boolean };

export const MAX_MESSAGE_LENGTH = 500;

/**
 * Parse and validate a message from the browser. Anything a client sends is untrusted, so malformed
 * messages are dropped.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const message = value as Record<string, unknown>;
  if (message.type === 'message' && typeof message.text === 'string') {
    const text = message.text.trim().slice(0, MAX_MESSAGE_LENGTH);
    return text ? { type: 'message', text } : null;
  }
  if (message.type === 'typing' && typeof message.typing === 'boolean')
    return { type: 'typing', typing: message.typing };
  return null;
}
