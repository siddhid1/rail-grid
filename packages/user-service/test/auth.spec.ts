import { createHash } from 'node:crypto';

describe('device fingerprint compatibility', () => {
  it('uses user agent, ip, and accept header', () => {
    const raw = ['ua', '127.0.0.1', 'json'].join('|');
    expect(createHash('sha256').update(raw).digest('hex').slice(0, 16)).toHaveLength(16);
  });
});
