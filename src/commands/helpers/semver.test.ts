import { describe, expect, it } from 'vitest';
import { maxVersion } from './semver.js';

describe('maxVersion', () => {
  it('returns the upper bound of an inclusive range', () => {
    expect(maxVersion('>=15.0.0 <=16.4.1')?.version).toBe('16.4.1');
  });

  it('returns the highest upper bound across a union of ranges', () => {
    expect(maxVersion('>=13.5.1 <=14.2.32 || >=15.0.0 <=16.4.1')?.version).toBe('16.4.1');
  });

  it('steps back one patch for an exclusive upper bound', () => {
    expect(maxVersion('>=15.0.0 <16.4.1')?.version).toBe('16.4.0');
  });

  it('returns null when the range has no upper bound', () => {
    expect(maxVersion('>=15.0.0')).toBeNull();
  });
});
