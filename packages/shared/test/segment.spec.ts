import { overlapSegments } from '../src/utils/time.js';

describe('segment overlap', () => {
  it('allows non-overlapping segments on the same seat', () => {
    expect(overlapSegments(1, 3, 3, 5)).toBe(false);
  });

  it('detects overlapping segments', () => {
    expect(overlapSegments(1, 4, 3, 5)).toBe(true);
  });
});
