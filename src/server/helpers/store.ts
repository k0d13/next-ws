import type { AsyncLocalStorage } from 'node:async_hooks';
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';

/** Readonly {@link Headers} implementation. */
class ReadonlyHeaders extends Headers {
  override append(): never {
    throw new Error('Headers are read-only');
  }

  override set(): never {
    throw new Error('Headers are read-only');
  }

  override delete(): never {
    throw new Error('Headers are read-only');
  }
}

/** Readonly {@link RequestCookies} implementation. */
class ReadonlyRequestsCookies extends RequestCookies {
  override set(): never {
    throw new Error('Cookies are read-only');
  }

  override delete(): never {
    throw new Error('Cookies are read-only');
  }
}

export interface RequestStore {
  readonly headers: ReadonlyHeaders;
  readonly cookies: ReadonlyRequestsCookies;
}

/**
 * Create a new request store.
 *
 * @param request {@link Request} instance
 * @returns A {@link RequestStore} object
 */
export function createRequestStore(request: Request): RequestStore {
  return {
    headers: new ReadonlyHeaders(request.headers),
    cookies: new ReadonlyRequestsCookies(request.headers),
  };
}

export type RequestStorage = AsyncLocalStorage<RequestStore>;
