import { sep } from 'node:path';
import $ from 'jscodeshift';
import { definePatch, definePatchStep } from './helpers/define.js';
import { resolveNextWsDirectory } from './helpers/next.js';

const CommentLine = $.Comment as typeof $.CommentLine;

/**
 * Add `require('next-ws/server').setupWebSocketServer(this)` to the constructor of
 * `NextNodeServer` in `next/dist/server/next-server.js`.
 * @remark Starting the server and handling connections is part of the core
 */
export const patchNextNodeServer = definePatchStep({
  title: 'Add WebSocket server setup script to NextNodeServer constructor',
  path: 'next:dist/server/next-server.js',
  async transform(code) {
    const marker = '@patch attach-websocket-server';
    const snippet = $(`
      // ${marker}
      let nextWs;
      try { nextWs ??= require('next-ws/server') } catch {}
      try { nextWs ??= require(require.resolve('next-ws/server', { paths: [process.cwd()] }) )} catch {}
      try { nextWs ??= require('${resolveNextWsDirectory().replaceAll(sep, '/').replaceAll("'", "\\'")}/dist/server/index.cjs') } catch {}
      const adapter = nextWs?.getAdapter?.();
      nextWs?.setupWebSocketServer(this, adapter ? { adapter } : undefined);
    `);
    const block = $.blockStatement(snippet.nodes()[0].program.body);

    return $(code)
      .find($.ClassDeclaration, { id: { name: 'NextNodeServer' } })
      .find($.MethodDefinition, { kind: 'constructor' })
      .forEach(({ node }) => {
        const body = (node.value.body as $.BlockStatement).body;

        const existing = $(body)
          .find(CommentLine, { value: ` ${marker}` })
          .paths()[0];
        const idx = body.indexOf(existing?.parent.node);

        if (existing && idx > -1) body[idx] = block;
        else body.push(block);
      })
      .toSource();
  },
});

/**
 * Prevent Next.js from immediately closing WebSocket connections on matched routes.
 */
export const patchRouterServer = definePatchStep({
  title: 'Prevent Next.js from immediately closing WebSocket connections',
  path: 'next:dist/server/lib/router-server.js',
  async transform(code) {
    return $(code)
      .find($.ReturnStatement)
      .find($.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'socket' },
          property: { type: 'Identifier', name: 'end' },
        },
      })
      .replaceWith((path) => {
        const expr = $.unaryExpression('void', $.literal(0)); // void 0
        expr.comments = [$.commentLine(` ${$(path.node).toSource()}`)];
        return expr;
      })
      .toSource();
  },
});

/**
 * Add UPGRADE as allowed route HTTP method.
 */
export const patchNextTypesPlugin = definePatchStep({
  title: 'Add UPGRADE as allowed export from route modules',
  path: 'next:dist/build/webpack/plugins/next-types-plugin/index.js',
  async transform(code) {
    return $(code)
      .find($.MemberExpression, {
        property: { name: 'HTTP_METHODS' },
      })
      .at(0)
      .replaceWith((path) => {
        if (path.parent.value.type === 'SpreadElement') return path.node;
        return $.arrayExpression([
          $.spreadElement(path.node),
          $.literal('UPGRADE'),
          $.literal('SOCKET'),
        ]);
      })
      .toSource();
  },
});

/**
 * Add WebSocket contextual headers resolution to request headers.
 */
export const patchHeaders = definePatchStep({
  title: 'Add WebSocket contextual headers resolution to request headers',
  path: 'next:dist/client/components/headers.js',
  async transform(code) {
    const marker = '@patch headers';
    const snippet = $(`
      // ${marker}
      const kRequestStorage = Symbol.for('next-ws.request-store');
      const requestStorage = Reflect.get(globalThis, kRequestStorage);
      const contextualHeaders = requestStorage?.getStore()?.headers;
      if (contextualHeaders) return contextualHeaders;
    `);
    const block = $.blockStatement(snippet.nodes()[0].program.body);

    return $(code)
      .find($.FunctionDeclaration, { id: { name: 'headers' } })
      .forEach(({ node }) => {
        const body = node.body.body;

        const existing = $(body)
          .find(CommentLine, { value: ` ${marker}` })
          .paths()[0];
        const idx = body.indexOf(existing?.parent.node);

        if (existing && idx > -1) body[idx] = block;
        else body.unshift(block);
      })
      .toSource();
  },
});

/**
 * Add WebSocket contextual cookies resolution to request cookies.
 */
export const patchCookies = definePatchStep({
  title: 'Add WebSocket contextual cookies resolution to request cookies',
  path: 'next:dist/client/components/headers.js',
  async transform(code) {
    const marker = '@patch cookies';
    const snippet = $(`
      // ${marker}
      const kRequestStorage = Symbol.for('next-ws.request-store');
      const requestStorage = Reflect.get(globalThis, kRequestStorage);
      const contextualCookies = requestStorage?.getStore()?.cookies;
      if (contextualCookies) return contextualCookies;
    `);
    const block = $.blockStatement(snippet.nodes()[0].program.body);

    return $(code)
      .find($.FunctionDeclaration, { id: { name: 'cookies' } })
      .forEach(({ node }) => {
        const body = node.body.body;

        const existing = $(body)
          .find(CommentLine, { value: ` ${marker}` })
          .paths()[0];
        const idx = body.indexOf(existing?.parent.node);

        if (existing && idx > -1) body[idx] = block;
        else body.unshift(block);
      })
      .toSource();
  },
});

export default definePatch({
  name: 'patch-1',
  versions: '>=13.5.1 <=14.2.32',
  steps: [
    patchNextNodeServer,
    patchNextTypesPlugin,
    patchRouterServer,
    patchHeaders,
    patchCookies,
  ],
});
