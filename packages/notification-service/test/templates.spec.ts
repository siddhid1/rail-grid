import { getOtpTemplate } from '../src/email/templates.js';
describe('email templates', () => {
  it('renders OTP codes', () => expect(getOtpTemplate('123456', 5)).toContain('123456'));
});
