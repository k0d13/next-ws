/** One reading of how the server is doing. */
export interface Sample {
  at: number;
  /** Resident set size, in bytes. */
  rss: number;
  /** JavaScript heap in use, in bytes. */
  heapUsed: number;
  /** Share of one CPU core used since the last sample, from 0 to 1. */
  cpu: number;
  /** Mean event loop delay since the last sample, in milliseconds. */
  eventLoopDelay: number;
}

export interface Announcement {
  id: string;
  text: string;
  at: number;
}

/** Everything the server pushes to the dashboard. */
export type DashboardEvent =
  | { type: 'history'; samples: Sample[] }
  | { type: 'sample'; sample: Sample; viewers: number }
  | { type: 'announcement'; announcement: Announcement };

/** How many samples the server keeps, and the dashboard charts. */
export const HISTORY_LENGTH = 60;

/** Room every dashboard viewer joins, so announcements can be broadcast to all of them. */
export const DASHBOARD_ROOM = 'dashboard';
