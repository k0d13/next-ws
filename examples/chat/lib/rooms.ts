import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ChatMessage, ServerMessage } from './protocol';

const HISTORY_LIMIT = 50;

/**
 * Everyone connected to one chat room on this server. State lives in memory, so it is lost on
 * restart and is not shared between servers. See the multi-instance example for scaling out.
 */
class Room {
  readonly members = new Map<WebSocket, string>();
  readonly history: ChatMessage[] = [];

  join(client: WebSocket, name: string) {
    this.members.set(client, name);
    send(client, { type: 'welcome', you: name, history: this.history, members: this.names() });
    this.broadcast({ type: 'presence', members: this.names() });
  }

  leave(client: WebSocket) {
    const name = this.members.get(client);
    this.members.delete(client);
    if (name) this.broadcast({ type: 'typing', name, typing: false });
    this.broadcast({ type: 'presence', members: this.names() });
  }

  post(author: string, text: string) {
    const message: ChatMessage = { id: randomUUID(), author, text, sentAt: Date.now() };
    this.history.push(message);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.broadcast({ type: 'message', message });
  }

  typing(client: WebSocket, typing: boolean) {
    const name = this.members.get(client);
    if (name) this.broadcast({ type: 'typing', name, typing }, client);
  }

  /** Everyone here, once each even with the room open in several tabs. */
  names() {
    return [...new Set(this.members.values())].sort((a, b) => a.localeCompare(b));
  }

  broadcast(message: ServerMessage, except?: WebSocket) {
    for (const client of this.members.keys()) if (client !== except) send(client, message);
  }
}

function send(client: WebSocket, message: ServerMessage) {
  if (client.readyState === client.OPEN) client.send(JSON.stringify(message));
}

const rooms = new Map<string, Room>();

/** Get a room, creating it on first use. */
export function getRoom(name: string) {
  let room = rooms.get(name);
  if (!room) rooms.set(name, (room = new Room()));
  return room;
}

/** Forget a room once everyone has left, so empty rooms do not pile up in memory. */
export function releaseRoom(name: string) {
  if (rooms.get(name)?.members.size === 0) rooms.delete(name);
}
