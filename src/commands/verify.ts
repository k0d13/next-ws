import { getInstalledNextVersion, readTrace } from '~/patches/helpers/next.js';
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
    const trace = await readTrace();

    if (!trace) {
      if (options.ensure) {
        console.warn('Next.js has not been patched, running the patch command');
        return patchCommand.action({ yes: true });
      } else {
        console.error("Next.js has not been patched, you'll need to run the patch command");
        process.exit(1);
      }
    }

    const current = await getInstalledNextVersion();
    if (current !== trace.version) {
      console.error(
        "Next.js has been patched with a different version, you'll need to run the patch command",
      );
      process.exit(1);
    }

    console.info('Next.js has been patched!');
  },
});
