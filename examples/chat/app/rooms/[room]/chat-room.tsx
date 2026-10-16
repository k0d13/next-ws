'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  type ChatMessage,
  type ClientMessage,
  MAX_MESSAGE_LENGTH,
  type ServerMessage,
} from '@/lib/protocol';
import { useSocket } from '@/lib/use-socket';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function ChatRoom({ room }: { room: string }) {
  const [me, setMe] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { status, send } = useSocket(`/api/rooms/${room}`, (data) => {
    const message = JSON.parse(data) as ServerMessage;
    switch (message.type) {
      case 'welcome':
        setMe(message.you);
        setMessages(message.history);
        setMembers(message.members);
        setTyping([]);
        break;
      case 'message':
        setMessages((previous) => [...previous, message.message]);
        setTyping((previous) => previous.filter((name) => name !== message.message.author));
        break;
      case 'presence':
        setMembers(message.members);
        break;
      case 'typing':
        setTyping((previous) =>
          message.typing
            ? [...new Set([...previous, message.name])]
            : previous.filter((name) => name !== message.name),
        );
        break;
    }
  });

  // Keep the newest message in view
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function emit(message: ClientMessage) {
    send(JSON.stringify(message));
  }

  function stopTyping() {
    clearTimeout(typingTimeout.current);
    typingTimeout.current = undefined;
    emit({ type: 'typing', typing: false });
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (!typingTimeout.current) emit({ type: 'typing', typing: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, 2000);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    emit({ type: 'message', text: draft });
    stopTyping();
    setDraft('');
  }

  return (
    <main className="chat">
      <header>
        <Link href="/" className="link">
          ← Rooms
        </Link>
        <h1>#{room}</h1>
        <span className={`status ${status}`}>
          {status === 'open' ? `${members.length} online` : status}
        </span>
      </header>

      <ul className="members" aria-label="Online">
        {members.map((name) => (
          <li key={name} className={name === me ? 'me' : undefined}>
            {name}
          </li>
        ))}
      </ul>

      <ol ref={listRef} className="messages">
        {messages.length === 0 && <li className="muted">No messages yet, say hello!</li>}
        {messages.map((message) => (
          <li key={message.id} className={message.author === me ? 'mine' : undefined}>
            <span className="meta">
              {message.author === me ? 'You' : message.author} · {timeFormat.format(message.sentAt)}
            </span>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>

      <p className="typing muted" aria-live="polite">
        {typing.length === 1 && `${typing[0]} is typing…`}
        {typing.length > 1 && `${typing.join(', ')} are typing…`}
      </p>

      <form onSubmit={onSubmit} className="row">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={`Message #${room}`}
          aria-label="Message"
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={status !== 'open'}
          autoFocus
        />
        <button type="submit" disabled={status !== 'open' || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
