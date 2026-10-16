import { getInstalledNextVersion, writeTrace } from '~/patches/helpers/next.js';
import patches from '~/patches/index.js';
import { version as nextWsVersion } from '../../package.json';
import * as console from './helpers/console.js';
import { defineCommand } from './helpers/define.js';
import * as semver from './helpers/semver.js';

export default defineCommand({
  name: 'patch',
  description: 'Patch the local Next.js installation to support WebSockets',
  options: [
    {
      name: 'yes',
      description: 'Skip confirmation prompt for unsupported versions',
      alias: 'y',
    },
  ],
  async action(options) {
    const supported = patches.map((p) => p.versions).join(' || ');
    const current = await getInstalledNextVersion();
    let patch = patches.find((p) => semver.satisfies(current, p.versions));

    if (!patch && semver.ltr(current, supported)) {
      // The installed version is lower than the minimum supported version
      const minimum = semver.minVersion(supported)?.version ?? supported;
      console.error(`Next.js v${current} is not supported, a minimum of v${minimum} is required`);
      process.exit(1);
    }

    if (!patch) {
      // The installed version is newer than any patch was written for
      console.warn(`Next.js v${current} is not supported yet, next-ws supports '${supported}'.`);
      const confirm = options.yes || (await console.confirm('Are you sure you want to proceed?'));
      if (!confirm) {
        console.error('Aborted, pass --yes to patch without asking');
        process.exit(1);
      }
      patch = patches[patches.length - 1]!;
      console.info('Proceeding with the latest patch');
      console.log(
        'If you encounter any issues please report them at https://github.com/k0d13/next-ws/issues',
      );
    } else if (semver.gt(current, patch.tested)) {
      // Every step checks it found what it changes, so an untested version either works or fails here
      console.warn(`Next.js v${current} is newer than v${patch.tested}, the last version tested`);
    }

    console.info(`Patching Next.js v${current} with '${patch.versions}'`);
    await patch.execute();

    console.info('Saving patch trace file...');
    await writeTrace({ patch: patch.versions, version: current, nextWs: nextWsVersion });

    console.info('All done!');
  },
});
