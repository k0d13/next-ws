'use server';

import { randomUUID } from 'node:crypto';
import { broadcast, getClients } from 'next-ws/server';
import { DASHBOARD_ROOM, type DashboardEvent } from '@/lib/events';

export interface AnnounceState {
  error?: string;
  sentTo?: number;
}

/**
 * Push an announcement to every open dashboard. Server actions and route handlers run in the same
 * process as the WebSocket server, so they can broadcast to a room directly.
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
  const sentTo = getClients(DASHBOARD_ROOM).length;
  await broadcast(DASHBOARD_ROOM, JSON.stringify(event));
  return { sentTo };
}
