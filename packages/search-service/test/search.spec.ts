import { toIsoDate } from '@irctc/shared';
describe('search date normalization', () => {
  it('normalizes dates to yyyy-mm-dd', () => expect(toIsoDate('2026-06-01T10:00:00.000Z')).toBe('2026-06-01'));
});
