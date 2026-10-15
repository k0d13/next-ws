'use server';

import { randomUUID } from 'node:crypto';
import { getWebSocketServer } from 'next-ws/server';
import type { DashboardEvent } from '@/lib/events';

export interface AnnounceState {
  error?: string;
  sentTo?: number;
}

/**
 * Push an announcement to every open dashboard. Server actions and route handlers run in the same
 * process as the WebSocket server, so they can reach its clients directly.
 */
export async function announce(_: AnnounceState, formData: FormData): Promise<AnnounceState> {
  const text = String(formData.get('text') ?? '')
    .trim()
    .slice(0, 280);
  if (!text) return { error: 'Write something first' };

  const event: DashboardEvent = {
    type: 'announcement',
    announcement: { id: randomUUID(), text, at: Date.now() },
  };
  const message = JSON.stringify(event);

  let sentTo = 0;
  for (const client of getWebSocketServer()?.clients ?? []) {
    if (client.readyState !== client.OPEN) continue;
    client.send(message);
    sentTo++;
  }
  return { sentTo };
}
