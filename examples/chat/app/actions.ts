'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NAME_COOKIE, normaliseName, normaliseRoom } from '@/lib/session';

export async function signIn(formData: FormData) {
  const name = normaliseName(formData.get('name'));
  if (!name) return;
  (await cookies()).set(NAME_COOKIE, name, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/');
}

export async function signOut() {
  (await cookies()).delete(NAME_COOKIE);
  redirect('/');
}

export async function joinRoom(formData: FormData) {
  const room = normaliseRoom(formData.get('room'));
  if (room) redirect(`/rooms/${room}`);
}
