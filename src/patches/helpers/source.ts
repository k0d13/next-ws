import { type Node, parse } from 'acorn';

/** An acorn node with whatever properties its type has. */
export type AnyNode = Node & Record<string, unknown>;

/**
 * Parse a CommonJS file from the Next.js package.
 *
 * @param code Source code
 * @returns Program node
 */
export function parseScript(code: string) {
  return parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowReturnOutsideFunction: true,
  });
}

function isNode(value: unknown): value is AnyNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

/**
 * Find every node a predicate accepts, depth first.
 *
 * @param root Node to search from
 * @param predicate Test for each node, given the node and its parent
 * @returns Matching nodes, in source order
 */
export function findAll(root: Node, predicate: (node: AnyNode, parent?: AnyNode) => boolean) {
  const found: AnyNode[] = [];
  const visit = (node: AnyNode, parent?: AnyNode) => {
    if (predicate(node, parent)) found.push(node);
    for (const value of Object.values(node))
      for (const child of Array.isArray(value) ? value : [value])
        if (isNode(child)) visit(child, node);
  };
  visit(root as AnyNode);
  return found;
}

// ===== Regions ===== //

/**
 * Every change a patch makes is wrapped in a region that remembers the code it replaced, so
 * applying a patch again first puts the original back, and the same input always gives the same
 * output.
 */
const regionPattern = (id: string) =>
  new RegExp(
    String.raw`/\*next-ws:begin ${id} ("(?:[^"\\]|\\.)*")\*/[\s\S]*?/\*next-ws:end ${id}\*/`,
    'g',
  );

/**
 * Wrap a replacement in a region.
 *
 * @param id Identifier of the patch step
 * @param original Code the replacement stands in for, empty for an insertion
 * @param replacement Code to put in its place
 * @returns The marked replacement
 */
export function region(id: string, original: string, replacement: string) {
  const encoded = JSON.stringify(original);
  if (encoded.includes('*/')) throw new Error(`Cannot mark code containing '*/' in ${id}`);
  return `/*next-ws:begin ${id} ${encoded}*/${replacement}/*next-ws:end ${id}*/`;
}

/**
 * Put back the code every region of a step replaced.
 *
 * @param code Possibly patched code
 * @param id Identifier of the patch step
 * @returns Code without the step's regions
 */
export function restore(code: string, id: string) {
  return code.replace(regionPattern(id), (_, original: string) => JSON.parse(original));
}
