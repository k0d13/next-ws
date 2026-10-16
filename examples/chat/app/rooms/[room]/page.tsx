import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NAME_COOKIE, normaliseName, normaliseRoom } from '@/lib/session';
import { ChatRoom } from './chat-room';

export default async function RoomPage({ params }: { params: Promise<{ room: string }> }) {
  const room = normaliseRoom((await params).room);
  if (!room) notFound();
  if (!normaliseName((await cookies()).get(NAME_COOKIE)?.value)) redirect('/');

  return <ChatRoom room={room} />;
}
