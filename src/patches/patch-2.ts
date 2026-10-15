import { sep } from 'node:path';
import $ from 'jscodeshift';
import { definePatch, definePatchStep } from './helpers/define.js';
import { resolveNextWsDirectory } from './helpers/next.js';

const CommentLine = $.Comment as typeof $.CommentLine;

/**
 * Add `require('next-ws/server').setupWebSocketServer(this)` to the constructor of `NextNodeServer`
 * in `next/dist/server/next-server.js`.
 *
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
      try { nextWs ??= require('${resolveNextWsDirectory().replaceAll(sep, '/').replaceAll("'", "'")}/dist/server/index.cjs') } catch {}
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
      .toSource({ lineTerminator: '\n' });
  },
});

/** Prevent Next.js from immediately closing WebSocket connections on matched routes. */
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
        // Recast wraps a commented return argument in parentheses, so print them up front or a
        // second run would add them and the patch would not be idempotent
        Reflect.set(expr, 'extra', { parenthesized: true });
        return expr;
      })
      .toSource({ lineTerminator: '\n' });
  },
});

/** Add UPGRADE as allowed route HTTP method. */
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
        return $.arrayExpression([$.spreadElement(path.node), $.literal('UPGRADE')]);
      })
      .toSource({ lineTerminator: '\n' });
  },
});

/**
 * Make a request function such as `headers()` return the WebSocket request's value when called
 * while handling an upgrade.
 *
 * @param name Name of the function and of the property on the request store
 * @param path Path of the file the function is declared in
 * @returns Patch step
 */
function patchRequestFunction(name: 'headers' | 'cookies', path: `next:${string}`) {
  const variable = `contextual${name[0]!.toUpperCase()}${name.slice(1)}`;
  return definePatchStep({
    title: `Add WebSocket contextual ${name} resolution to request ${name}`,
    path,
    async transform(code) {
      const marker = `@patch ${name}`;
      const snippet = $(`
        // ${marker}
        const kRequestStorage = Symbol.for('next-ws.request-store');
        const requestStorage = Reflect.get(globalThis, kRequestStorage);
        const ${variable} = requestStorage?.getStore()?.${name};
        if (${variable}) return ${variable};
      `);
      const block = $.blockStatement(snippet.nodes()[0].program.body);

      return $(code)
        .find($.FunctionDeclaration, { id: { name } })
        .forEach(({ node }) => {
          const body = node.body.body;

          const existing = $(body)
            .find(CommentLine, { value: ` ${marker}` })
            .paths()[0];
          const idx = body.indexOf(existing?.parent.node);

          if (existing && idx > -1) body[idx] = block;
          else body.unshift(block);
        })
        .toSource({ lineTerminator: '\n' });
    },
  });
}

/** Add WebSocket contextual headers resolution to request headers. */
export const patchHeaders = patchRequestFunction('headers', 'next:dist/server/request/headers.js');

/** Add WebSocket contextual cookies resolution to request cookies. */
export const patchCookies = patchRequestFunction('cookies', 'next:dist/server/request/cookies.js');

export default definePatch({
  name: 'patch-2',
  versions: '>=15.0.0 <=16.4.2',
  steps: [patchNextNodeServer, patchRouterServer, patchNextTypesPlugin, patchHeaders, patchCookies],
});
