import { getInstalledNextVersion, readTrace } from '~/patches/helpers/next.js';
import { version as nextWsVersion } from '../../package.json';
import * as console from './helpers/console.js';
import { defineCommand } from './helpers/define.js';
import patchCommand from './patch.js';

export default defineCommand({
  name: 'verify',
  description: 'Verify that the local Next.js installation has been patched',
  options: [
    {
      name: 'ensure',
      description: 'If not patched, then run the patch command',
      alias: 'e',
    },
  ],
  async action(options) {
    const problem = await findProblem();
    if (!problem) return console.info('Next.js has been patched!');

    if (options.ensure) {
      console.warn(`${problem}, running the patch command`);
      return patchCommand.action({ yes: true });
    }

    console.error(`${problem}, you'll need to run the patch command`);
    process.exit(1);
  },
});

/**
 * Check the trace against the installed versions of Next.js and next-ws.
 *
 * @returns Why the installation needs patching, if it does
 */
async function findProblem() {
  const trace = await readTrace();
  if (!trace) return 'Next.js has not been patched';

  const current = await getInstalledNextVersion();
  if (trace.version !== current) return 'Next.js has been patched with a different version';

  // The patched code points at this next-ws installation, so an upgrade needs a new patch
  if (trace.nextWs !== nextWsVersion)
    return 'Next.js has been patched by a different version of next-ws';

  return null;
}
