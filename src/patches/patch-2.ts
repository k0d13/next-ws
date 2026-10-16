import { sep } from 'node:path';
import MagicString from 'magic-string';
import { definePatch, definePatchStep } from './helpers/define.js';
import { resolveNextWsDirectory } from './helpers/next.js';
import { type AnyNode, findAll, parseScript, region, restore } from './helpers/source.js';

/**
 * Call `setupWebSocketServer(this)` at the end of the `NextNodeServer` constructor in
 * `next/dist/server/next-server.js`.
 *
 * @remark Starting the server and handling connections is part of the core
 */
export const patchNextNodeServer = definePatchStep({
  title: 'Add WebSocket server setup script to NextNodeServer constructor',
  path: 'next:dist/server/next-server.js',
  async transform(code) {
    const id = 'setup';
    code = restore(code, id)
      // Remove the block next-ws 2 added, so upgrading does not set up the server twice
      .replace(/\n[ \t]*\{\s*\/\/ @patch attach-websocket-server\n[\s\S]*?\n[ \t]*\}(?=\n)/, '');

    const nextNodeServer = findAll(
      parseScript(code),
      (node) => node.type === 'ClassDeclaration' && (node.id as AnyNode)?.name === 'NextNodeServer',
    )[0];
    const constructor =
      nextNodeServer &&
      findAll(
        nextNodeServer,
        (node) => node.type === 'MethodDefinition' && node.kind === 'constructor',
      )[0];
    if (!constructor) throw new Error('Could not find the NextNodeServer constructor');

    // A string literal, so quotes or backslashes in the install path can't break the snippet
    const serverPath = JSON.stringify(
      `${resolveNextWsDirectory().replaceAll(sep, '/')}/dist/server/index.cjs`,
    );
    const snippet = `
{
  let nextWs;
  try { nextWs = require('next-ws/server'); } catch {}
  try { nextWs ??= require(require.resolve('next-ws/server', { paths: [process.cwd()] })); } catch {}
  try { nextWs ??= require(${serverPath}); } catch {}
  if (nextWs) nextWs.setupWebSocketServer(this);
  else console.error('[next-ws] could not load next-ws/server, WebSocket routes will not work');
}
`;

    const body = (constructor.value as AnyNode).body as AnyNode;
    return new MagicString(code).appendLeft(body.end - 1, region(id, '', snippet)).toString();
  },
});

/** Prevent Next.js from immediately closing WebSocket connections on matched routes. */
export const patchRouterServer = definePatchStep({
  title: 'Prevent Next.js from immediately closing WebSocket connections',
  path: 'next:dist/server/lib/router-server.js',
  async transform(code) {
    const id = 'keep-socket-open';
    code = restore(code, id)
      // Put back what next-ws 2 commented out
      .replace(/return \(\s*\/\/ socket\.end\(\)\s*\(void 0\)\s*\)/g, 'return socket.end()');

    const calls = findAll(parseScript(code), (node, parent) => {
      if (parent?.type !== 'ReturnStatement' || node.type !== 'CallExpression') return false;
      const callee = node.callee as AnyNode;
      return (
        callee.type === 'MemberExpression' &&
        (callee.object as AnyNode).name === 'socket' &&
        (callee.property as AnyNode).name === 'end' &&
        (node.arguments as unknown[]).length === 0
      );
    });
    if (calls.length === 0) throw new Error("Could not find 'return socket.end()'");

    const source = new MagicString(code);
    for (const call of calls)
      source.overwrite(
        call.start,
        call.end,
        region(id, code.slice(call.start, call.end), 'void 0'),
      );
    return source.toString();
  },
});

/** Add UPGRADE as allowed route HTTP method. */
export const patchNextTypesPlugin = definePatchStep({
  title: 'Add UPGRADE as allowed export from route modules',
  path: 'next:dist/build/webpack/plugins/next-types-plugin/index.js',
  async transform(code) {
    const id = 'upgrade-method';
    code = restore(code, id)
      // Put back what next-ws 2 added, which wrote the method with double quotes
      .replace(/\[\s*\.\.\.([\w$.]*HTTP_METHODS),\s*(['"])UPGRADE\2\s*\]/, '$1');

    const methods = findAll(
      parseScript(code),
      (node) =>
        node.type === 'MemberExpression' &&
        !node.computed &&
        (node.property as AnyNode).name === 'HTTP_METHODS',
    )[0];
    if (!methods) throw new Error('Could not find HTTP_METHODS');

    const original = code.slice(methods.start, methods.end);
    return new MagicString(code)
      .overwrite(methods.start, methods.end, region(id, original, `[...${original}, 'UPGRADE']`))
      .toString();
  },
});

/**
 * Make a request function such as `headers()` resolve to the WebSocket request's value when called
 * while handling an upgrade.
 *
 * @param name Name of the function and of the property on the request store
 * @param path Path of the file the function is declared in
 * @returns Patch step
 */
function patchRequestFunction(name: 'headers' | 'cookies', path: `next:${string}`) {
  return definePatchStep({
    title: `Add WebSocket contextual ${name} resolution to request ${name}`,
    path,
    async transform(code) {
      const id = `request-${name}`;
      code = restore(code, id)
        // Remove the block next-ws 2 added
        .replace(
          new RegExp(String.raw`\{\s*// @patch ${name}\n[\s\S]*?return contextual\w+;\s*\}\s*`),
          '',
        );

      const functions = findAll(
        parseScript(code),
        (node) => node.type === 'FunctionDeclaration' && (node.id as AnyNode)?.name === name,
      );
      if (functions.length === 0) throw new Error(`Could not find the ${name}() function`);

      // Next.js resolves these to a promise, so this does too
      const snippet = `
{
  const store = globalThis[Symbol.for('next-ws.request-store')]?.getStore();
  if (store) return Promise.resolve(store.${name});
}
`;
      const source = new MagicString(code);
      for (const fn of functions)
        source.appendLeft((fn.body as AnyNode).start + 1, region(id, '', snippet));
      return source.toString();
    },
  });
}

/** Add WebSocket contextual headers resolution to request headers. */
export const patchHeaders = patchRequestFunction('headers', 'next:dist/server/request/headers.js');

/** Add WebSocket contextual cookies resolution to request cookies. */
export const patchCookies = patchRequestFunction('cookies', 'next:dist/server/request/cookies.js');

export default definePatch({
  name: 'patch-2',
  versions: '>=15.0.0 <17.0.0',
  tested: '16.4.2',
  steps: [patchNextNodeServer, patchRouterServer, patchNextTypesPlugin, patchHeaders, patchCookies],
});
