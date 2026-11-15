'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/use-socket';

const SAMPLES = 20;

export function Latency() {
  const [rounds, setRounds] = useState<number[]>([]);
  const sentAt = useRef(new Map<string, number>());

  const { status, send } = useSocket('/api/ping', (data) => {
    const { ping } = JSON.parse(data) as { ping: string };
    const started = sentAt.current.get(ping);
    if (started === undefined) return;
    sentAt.current.delete(ping);
    setRounds((previous) => [...previous, performance.now() - started].slice(-SAMPLES));
  });

  // Ping once a second while connected
  useEffect(() => {
    if (status !== 'open') return;
    let count = 0;
    const timer = setInterval(() => {
      const id = String(count++);
      sentAt.current.set(id, performance.now());
      send(id);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, send]);

  const latest = rounds.at(-1);
  const average = rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : undefined;
  const highest = Math.max(1, ...rounds);

  return (
    <main className="card">
      <h1>Round trip</h1>
      <p className={`status ${status}`}>{status}</p>
      <dl>
        <div>
          <dt className="muted">Latest</dt>
          <dd>{latest === undefined ? '–' : `${latest.toFixed(1)} ms`}</dd>
        </div>
        <div>
          <dt className="muted">Average</dt>
          <dd>{average === undefined ? '–' : `${average.toFixed(1)} ms`}</dd>
        </div>
      </dl>
      <ol className="bars" aria-label={`Last ${SAMPLES} round trips`}>
        {rounds.map((round, index) => (
          <li key={index} style={{ height: `${(round / highest) * 100}%` }} />
        ))}
      </ol>
      <p className="muted">
        Served by <code>server.ts</code>, which also answers <a href="/healthz">/healthz</a>.
      </p>
    </main>
  );
}
