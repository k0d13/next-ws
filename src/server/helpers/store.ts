import type { AsyncLocalStorage } from 'node:async_hooks';
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies/index.js';

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

export function createRequestStore(request: Request): RequestStore {
  return {
    headers: new ReadonlyHeaders(request.headers),
    cookies: new ReadonlyRequestsCookies(request.headers),
  };
}

export type RequestStorage = AsyncLocalStorage<RequestStore>;
