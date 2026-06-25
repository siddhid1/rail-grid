import { overlapSegments } from '@irctc/shared';
describe('segment lock rules', () => {
  it('permits adjacent segments', () => expect(overlapSegments(1, 3, 3, 5)).toBe(false));
  it('rejects overlapping segments', () => expect(overlapSegments(1, 4, 2, 5)).toBe(true));
});
