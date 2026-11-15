import { cookies } from 'next/headers';
import Link from 'next/link';
import { NAME_COOKIE, normaliseName } from '@/lib/session';
import { joinRoom, signIn, signOut } from './actions';

const suggestedRooms = ['general', 'random', 'help'];

export default async function Home() {
  const name = normaliseName((await cookies()).get(NAME_COOKIE)?.value);

  if (!name)
    return (
      <main className="card">
        <h1>Chat</h1>
        <p className="muted">Pick a name to start chatting. It is only kept in a cookie.</p>
        <form action={signIn} className="row">
          <input name="name" placeholder="Your name" maxLength={24} required autoFocus />
          <button type="submit">Continue</button>
        </form>
      </main>
    );

  return (
    <main className="card">
      <h1>Hi, {name}</h1>
      <p className="muted">Join a room, or make up a new one.</p>
      <ul className="rooms">
        {suggestedRooms.map((room) => (
          <li key={room}>
            <Link href={`/rooms/${room}`}>#{room}</Link>
          </li>
        ))}
      </ul>
      <form action={joinRoom} className="row">
        <input name="room" placeholder="room-name" maxLength={32} required />
        <button type="submit">Join</button>
      </form>
      <form action={signOut}>
        <button type="submit" className="link">
          Sign out
        </button>
      </form>
    </main>
  );
}
