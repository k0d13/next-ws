'use client';

import { useState } from 'react';
import { EMOJI, type Emoji, type Hello, isReaction, type Reaction } from '@/lib/reactions';
import { useSocket } from '@/lib/use-socket';

interface Floating {
  id: number;
  emoji: Emoji;
  left: number;
}

let nextId = 0;

export function Reactions() {
  const [instance, setInstance] = useState<string>();
  const [counts, setCounts] = useState<Partial<Record<Emoji, number>>>({});
  const [floating, setFloating] = useState<Floating[]>([]);

  function show(emoji: Emoji) {
    setCounts((previous) => ({ ...previous, [emoji]: (previous[emoji] ?? 0) + 1 }));
    // The stage is hidden with reduced motion, so the animation that removes each one never ends
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const item = { id: nextId++, emoji, left: 10 + Math.random() * 80 };
    setFloating((previous) => [...previous, item]);
  }

  const { status, send } = useSocket('/api/reactions', (data) => {
    const message = JSON.parse(data) as Hello | Reaction;
    if (message.type === 'hello') setInstance(message.instance);
    else if (isReaction(message)) show(message.emoji);
  });

  function react(emoji: Emoji) {
    const reaction: Reaction = { type: 'reaction', emoji };
    send(JSON.stringify(reaction));
    // The adapter does not send our own message back, so show it straight away
    show(emoji);
  }

  return (
    <main className="card">
      <h1>Reactions</h1>
      <p className={`status ${status}`}>
        {status === 'open' && instance ? `Connected to instance ${instance}` : status}
      </p>
      <div className="buttons">
        {EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            disabled={status !== 'open'}
            aria-label={`React with ${emoji}`}
          >
            <span aria-hidden="true">{emoji}</span>
            <small>{counts[emoji] ?? 0}</small>
          </button>
        ))}
      </div>
      <p className="muted">Open the other instance in another window, reactions show up on both.</p>
      <div className="stage" aria-hidden="true">
        {floating.map((item) => (
          <span
            key={item.id}
            style={{ left: `${item.left}%` }}
            onAnimationEnd={() =>
              setFloating((previous) => previous.filter(({ id }) => id !== item.id))
            }
          >
            {item.emoji}
          </span>
        ))}
      </div>
    </main>
  );
}
