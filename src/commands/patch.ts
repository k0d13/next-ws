import { getInstalledNextVersion, writeTrace } from '~/patches/helpers/next.js';
import patches from '~/patches/index.js';
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
    const minimum = semver.minVersion(supported)?.version ?? supported;
    const maximum = semver.maxVersion(supported)?.version ?? supported;
    const current = await getInstalledNextVersion();

    if (semver.ltr(current, minimum)) {
      // The installed version is lower than the minimum supported version
      console.error(
        `Next.js v${current} is not supported, a minimum of v${minimum} is required`,
      );
      process.exit(1);
    }

    let patch = patches.find((p) => semver.satisfies(current, p.versions));
    if (semver.gtr(current, maximum)) {
      // The installed version is higher than the maximum supported version
      console.warn(
        `Next.js v${current} is not officially supported, a maximum of v${maximum} is recommended.`,
      );
      const confirm =
        options.yes ||
        (await console.confirm('Are you sure you want to proceed?'));

      if (confirm) {
        patch = patches[patches.length - 1];
        console.info('Proceeding with the latest patch');
        console.log(
          'If you encounter any issues please report them at https://github.com/k0d13/next-ws/issues',
        );
      } else {
        console.error('Aborted');
        process.exit(1);
      }
    }

    if (!patch) {
      console.error(
        `Next.js v${current} is not supported, please upgrade to a version within the range '${supported}'`,
      );
      process.exit(1);
    }

    console.info(`Patching Next.js v${current} with '${patch.versions}'`);
    await patch.execute();

    console.info('Saving patch trace file...');
    await writeTrace({ patch: patch.versions, version: current });

    console.info('All done!');
  },
});
