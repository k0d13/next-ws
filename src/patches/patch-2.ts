import { definePatch, definePatchStep } from './helpers/define.js';
import {
  patchCookies as p1_patchCookies,
  patchHeaders as p1_patchHeaders,
  patchNextNodeServer as p1_patchNextNodeServer,
  patchNextTypesPlugin as p1_patchNextTypesPlugin,
  patchRouterServer as p1_patchRouterServer,
} from './patch-1.js';

export const patchHeaders = definePatchStep({
  ...p1_patchHeaders,
  // CHANGE(next@15): headers function was moved
  path: 'next:dist/server/request/headers.js',
});

export const patchCookies = definePatchStep({
  ...p1_patchCookies,
  // CHANGE(next@15): cookies function was moved
  path: 'next:dist/server/request/cookies.js',
});

export default definePatch({
  name: 'patch-2',
  versions: '>=15.0.0 <=16.1.4',
  steps: [
    p1_patchNextNodeServer,
    p1_patchRouterServer,
    p1_patchNextTypesPlugin,
    patchHeaders,
    patchCookies,
  ],
});
