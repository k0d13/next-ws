import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { WebSocket } from 'ws';
import { type DashboardEvent, HISTORY_LENGTH, type Sample } from './events';

const INTERVAL = 1000;

const viewers = new Set<WebSocket>();
const history: Sample[] = [];
let stopSampling: (() => void) | undefined;

/**
 * Start sending samples to a client. The server only measures itself while someone is watching, and
 * takes one sample for everyone rather than one per viewer.
 */
export function watch(client: WebSocket) {
  viewers.add(client);
  send(client, { type: 'history', samples: history });
  stopSampling ??= startSampling();

  client.once('close', () => {
    viewers.delete(client);
    if (viewers.size === 0) {
      stopSampling?.();
      stopSampling = undefined;
    }
  });
}

function startSampling() {
  const delay = monitorEventLoopDelay();
  delay.enable();
  let cpu = process.cpuUsage();
  let at = performance.now();

  const interval = setInterval(() => {
    const elapsed = (performance.now() - at) * 1000;
    const used = process.cpuUsage(cpu);
    const memory = process.memoryUsage();
    const sample: Sample = {
      at: Date.now(),
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      cpu: (used.user + used.system) / elapsed,
      eventLoopDelay: delay.mean / 1e6,
    };
    cpu = process.cpuUsage();
    at = performance.now();
    delay.reset();

    history.push(sample);
    if (history.length > HISTORY_LENGTH) history.shift();

    for (const client of viewers) send(client, { type: 'sample', sample, viewers: viewers.size });
  }, INTERVAL);

  return () => {
    clearInterval(interval);
    delay.disable();
  };
}

function send(client: WebSocket, event: DashboardEvent) {
  if (client.readyState === client.OPEN) client.send(JSON.stringify(event));
}
