import type NextNodeServer from 'next/dist/server/next-server.js';
import { describe, expect, it } from 'vitest';
import { findMatchingRoute } from './match.js';

/** Build the parts of a Next.js server that route matching reads. */
function createServer(routes: string[], options: { basePath?: string } = {}) {
  const appPathRoutes = Object.fromEntries(
    routes.map((r) => [r, [`app${r === '/' ? '' : r}/route`]]),
  );
  return {
    serverOptions: { conf: { basePath: options.basePath ?? '' } },
    appPathRoutes,
    getAppPathRoutes: () => ({}),
  } as unknown as NextNodeServer;
}

describe('findMatchingRoute', () => {
  it('matches a static route', () => {
    const server = createServer(['/api/ws']);
    expect(findMatchingRoute(server, '/api/ws')).toEqual({
      filename: 'app/api/ws/route',
      params: {},
    });
  });

  it('ignores a trailing slash on the request', () => {
    const server = createServer(['/api/ws']);
    expect(findMatchingRoute(server, '/api/ws/')?.filename).toBe('app/api/ws/route');
  });

  it('returns undefined when nothing matches', () => {
    const server = createServer(['/api/ws']);
    expect(findMatchingRoute(server, '/api/other')).toBeUndefined();
    expect(findMatchingRoute(server, '/api/ws/extra')).toBeUndefined();
  });

  it('reads routes from both appPathRoutes and getAppPathRoutes', () => {
    const server = {
      serverOptions: { conf: {} },
      appPathRoutes: { '/a': ['app/a/route'] },
      getAppPathRoutes: () => ({ '/b': ['app/b/route'] }),
    } as unknown as NextNodeServer;
    expect(findMatchingRoute(server, '/a')?.filename).toBe('app/a/route');
    expect(findMatchingRoute(server, '/b')?.filename).toBe('app/b/route');
  });

  it('skips routes without a file', () => {
    const server = {
      serverOptions: { conf: {} },
      appPathRoutes: { '/a': [], '/[slug]': ['app/[slug]/route'] },
      getAppPathRoutes: () => ({}),
    } as unknown as NextNodeServer;
    expect(findMatchingRoute(server, '/a')?.filename).toBe('app/[slug]/route');
  });

  it('escapes regex characters in static segments', () => {
    const server = createServer(['/api/v1.0']);
    expect(findMatchingRoute(server, '/api/v1.0')).toBeDefined();
    expect(findMatchingRoute(server, '/api/v1x0')).toBeUndefined();
  });

  // ===== Parameters ===== //

  describe('parameters', () => {
    it('extracts a dynamic segment', () => {
      const server = createServer(['/rooms/[room]/ws']);
      expect(findMatchingRoute(server, '/rooms/general/ws')?.params).toEqual({ room: 'general' });
    });

    it('extracts several dynamic segments', () => {
      const server = createServer(['/[org]/[repo]/ws']);
      expect(findMatchingRoute(server, '/k0d13/next-ws/ws')?.params).toEqual({
        org: 'k0d13',
        repo: 'next-ws',
      });
    });

    it('does not let a dynamic segment span a slash', () => {
      const server = createServer(['/rooms/[room]/ws']);
      expect(findMatchingRoute(server, '/rooms/a/b/ws')).toBeUndefined();
    });

    it('extracts a catch-all segment as an array', () => {
      const server = createServer(['/files/[...path]']);
      expect(findMatchingRoute(server, '/files/a/b/c')?.params).toEqual({ path: ['a', 'b', 'c'] });
    });

    it('requires at least one segment for a catch-all', () => {
      const server = createServer(['/files/[...path]']);
      expect(findMatchingRoute(server, '/files')).toBeUndefined();
    });

    it('extracts an optional catch-all segment as an array', () => {
      const server = createServer(['/docs/[[...slug]]']);
      expect(findMatchingRoute(server, '/docs/a/b')?.params).toEqual({ slug: ['a', 'b'] });
    });

    it('matches an optional catch-all with no segments', () => {
      const server = createServer(['/docs/[[...slug]]']);
      expect(findMatchingRoute(server, '/docs')).toEqual({
        filename: 'app/docs/[[...slug]]/route',
        params: {},
      });
    });

    it('decodes parameter values', () => {
      const server = createServer(['/rooms/[room]']);
      expect(findMatchingRoute(server, '/rooms/hello%20world')?.params).toEqual({
        room: 'hello world',
      });
    });
  });

  // ===== Base Path ===== //

  describe('base path', () => {
    it('prefixes every route with the base path', () => {
      const server = createServer(['/api/ws'], { basePath: '/app' });
      expect(findMatchingRoute(server, '/app/api/ws')?.filename).toBe('app/api/ws/route');
    });

    it('does not match routes outside the base path', () => {
      const server = createServer(['/api/ws'], { basePath: '/app' });
      expect(findMatchingRoute(server, '/api/ws')).toBeUndefined();
    });

    it('extracts parameters under a base path', () => {
      const server = createServer(['/rooms/[room]'], { basePath: '/app' });
      expect(findMatchingRoute(server, '/app/rooms/general')?.params).toEqual({ room: 'general' });
    });
  });

  // ===== Priority ===== //

  describe('priority', () => {
    it('prefers a static segment over a dynamic one', () => {
      const server = createServer(['/rooms/[room]', '/rooms/lobby']);
      expect(findMatchingRoute(server, '/rooms/lobby')?.filename).toBe('app/rooms/lobby/route');
      expect(findMatchingRoute(server, '/rooms/other')?.filename).toBe('app/rooms/[room]/route');
    });

    it('prefers a dynamic segment over a catch-all', () => {
      const server = createServer(['/a/[...rest]', '/a/[id]']);
      expect(findMatchingRoute(server, '/a/1')?.filename).toBe('app/a/[id]/route');
      expect(findMatchingRoute(server, '/a/1/2')?.filename).toBe('app/a/[...rest]/route');
    });

    it('prefers a catch-all over an optional catch-all', () => {
      const server = createServer(['/a/[[...rest]]', '/a/[...rest]']);
      expect(findMatchingRoute(server, '/a/1')?.filename).toBe('app/a/[...rest]/route');
      expect(findMatchingRoute(server, '/a')?.filename).toBe('app/a/[[...rest]]/route');
    });

    it('prefers a longer static route over a shorter catch-all', () => {
      const server = createServer(['/[...rest]', '/api/ws']);
      expect(findMatchingRoute(server, '/api/ws')?.filename).toBe('app/api/ws/route');
    });

    it('does not depend on the order routes are declared in', () => {
      const a = createServer(['/rooms/[room]', '/rooms/lobby']);
      const b = createServer(['/rooms/lobby', '/rooms/[room]']);
      expect(findMatchingRoute(a, '/rooms/lobby')).toEqual(findMatchingRoute(b, '/rooms/lobby'));
    });

    it('prefers the route whose earlier segment is static', () => {
      const server = createServer(['/[a]/b', '/a/[b]']);
      expect(findMatchingRoute(server, '/a/b')?.filename).toBe('app/a/[b]/route');
    });

    it('prefers an exact route over an optional catch-all', () => {
      const server = createServer(['/docs/[[...slug]]', '/docs']);
      expect(findMatchingRoute(server, '/docs')?.filename).toBe('app/docs/route');
    });
  });

  it('extracts parameters whose names are not identifiers', () => {
    const server = createServer(['/posts/[post-id]/[...rest-of]']);
    expect(findMatchingRoute(server, '/posts/1/a/b')?.params).toEqual({
      'post-id': '1',
      'rest-of': ['a', 'b'],
    });
  });

  it('reuses the routes of a production server', () => {
    let reads = 0;
    const server = {
      serverOptions: { conf: {} },
      appPathRoutes: {},
      getAppPathRoutes: () => (reads++, { '/a': ['app/a/route'] }),
    } as unknown as NextNodeServer;
    findMatchingRoute(server, '/a');
    findMatchingRoute(server, '/a');
    expect(reads).toBe(1);
  });

  it('reads the routes again in development, as they are compiled', () => {
    let reads = 0;
    const server = {
      serverOptions: { conf: {}, dev: true },
      appPathRoutes: {},
      getAppPathRoutes: () => (reads++, { '/a': ['app/a/route'] }),
    } as unknown as NextNodeServer;
    findMatchingRoute(server, '/a');
    findMatchingRoute(server, '/a');
    expect(reads).toBe(2);
  });

  // ===== Root ===== //

  it('matches a root route', () => {
    const server = createServer(['/']);
    expect(findMatchingRoute(server, '/')?.filename).toBe('app/route');
  });

  it('matches a root route at the base path', () => {
    const server = createServer(['/'], { basePath: '/app' });
    expect(findMatchingRoute(server, '/app')?.filename).toBe('app/route');
    expect(findMatchingRoute(server, '/application')).toBeUndefined();
  });
});
