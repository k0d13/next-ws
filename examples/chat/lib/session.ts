/** Cookie holding the display name, set by the sign in form and read when a socket connects. */
export const NAME_COOKIE = 'chat-name';

/** Clean up a display name, returning null when nothing usable is left. */
export function normaliseName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || null;
}

/** Turn whatever someone typed into a room name that is safe in a URL. */
export function normaliseRoom(value: unknown) {
  if (typeof value !== 'string') return null;
  const room = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return room || null;
}
