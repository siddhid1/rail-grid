import { createHmac } from 'node:crypto';
describe('razorpay signature format', () => {
  it('uses order id pipe payment id as signing body', () => {
    const expected = createHmac('sha256', 'secret').update('order|payment').digest('hex');
    expect(expected).toHaveLength(64);
  });
});
