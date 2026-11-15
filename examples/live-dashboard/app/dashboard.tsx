'use client';

import { useActionState, useState } from 'react';
import { type Announcement, type DashboardEvent, HISTORY_LENGTH, type Sample } from '@/lib/events';
import { useSocket } from '@/lib/use-socket';
import { announce } from './actions';

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const milliseconds = (value: number) => `${value.toFixed(1)} ms`;
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

export function Dashboard() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [viewers, setViewers] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const { status } = useSocket('/api/metrics', (data) => {
    const event = JSON.parse(data) as DashboardEvent;
    if (event.type === 'history') setSamples(event.samples);
    else if (event.type === 'sample') {
      setSamples((previous) => [...previous, event.sample].slice(-HISTORY_LENGTH));
      setViewers(event.viewers);
    } else if (event.type === 'announcement')
      setAnnouncements((previous) => [event.announcement, ...previous].slice(0, 10));
  });

  const latest = samples.at(-1);

  return (
    <main className="dashboard">
      <header>
        <h1>Server dashboard</h1>
        <span className={`status ${status}`}>
          {status === 'open' ? `${viewers} watching` : status}
        </span>
      </header>

      <section className="tiles" aria-label="Metrics">
        <Tile
          label="CPU"
          value={latest && percent(latest.cpu)}
          points={samples.map((s) => s.cpu)}
        />
        <Tile
          label="Memory"
          value={latest && megabytes(latest.rss)}
          points={samples.map((s) => s.rss)}
        />
        <Tile
          label="Heap"
          value={latest && megabytes(latest.heapUsed)}
          points={samples.map((s) => s.heapUsed)}
        />
        <Tile
          label="Event loop delay"
          value={latest && milliseconds(latest.eventLoopDelay)}
          points={samples.map((s) => s.eventLoopDelay)}
        />
      </section>

      <section className="announcements">
        <h2>Announcements</h2>
        <AnnounceForm />
        <ol>
          {announcements.length === 0 && (
            <li className="muted">Nothing yet. Post one and every open dashboard gets it.</li>
          )}
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <time className="muted">{timeFormat.format(announcement.at)}</time>
              <p>{announcement.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Tile({ label, value, points }: { label: string; value?: string; points: number[] }) {
  return (
    <figure className="tile">
      <figcaption className="muted">{label}</figcaption>
      <strong>{value ?? '–'}</strong>
      <Sparkline points={points} />
    </figure>
  );
}

/** A line of the last minute of values, scaled to fit. */
function Sparkline({ points }: { points: number[] }) {
  const width = 200;
  const height = 40;
  if (points.length < 2) return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} />;

  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const step = width / (HISTORY_LENGTH - 1);
  const offset = width - (points.length - 1) * step;
  const path = points
    .map((point, index) => {
      const x = offset + index * step;
      const y = height - 2 - ((point - min) / range) * (height - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function AnnounceForm() {
  const [state, action, pending] = useActionState(announce, {});
  return (
    <form action={action} className="row">
      <input
        name="text"
        placeholder="Deploying in 5 minutes…"
        aria-label="Announcement"
        maxLength={280}
        required
      />
      <button type="submit" disabled={pending}>
        Announce
      </button>
      <span className="muted" role="status">
        {state.error ?? (state.sentTo !== undefined && `Sent to ${state.sentTo}`)}
      </span>
    </form>
  );
}
