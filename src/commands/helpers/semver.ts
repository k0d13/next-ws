import type { Options } from 'semver';
import Range from 'semver/classes/range.js';
import SemVer from 'semver/classes/semver.js';
import gt from 'semver/functions/gt.js';

/**
 * Get the maximum version from a range
 *
 * @param range Range or string
 * @param loose Options or boolean
 * @returns Maximum version
 */
export function maxVersion(range: Range | string, loose?: Options | boolean) {
  range = new Range(range, loose);
  let maximumVersion: SemVer | null = null;

  for (const comparators of range.set) {
    for (const {
      operator,
      semver: { version: version_ },
    } of comparators) {
      if (operator === '>' || operator === '>=') continue;

      const version = new SemVer(version_);

      if (operator === '<') {
        version.patch--;
        version.raw = version.format();
      }

      if (!maximumVersion || gt(version, maximumVersion)) maximumVersion = version;
    }
  }

  return maximumVersion;
}

export { default as satisfies } from 'semver/functions/satisfies';
export { default as gtr } from 'semver/ranges/gtr';
export { default as ltr } from 'semver/ranges/ltr';
export { default as minVersion } from 'semver/ranges/min-version';
