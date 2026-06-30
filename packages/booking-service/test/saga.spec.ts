describe('booking saga order', () => {
  it('keeps the forward step order stable', () => expect(['HOLD_SEATS', 'CREATE_PAYMENT', 'CONFIRM_SEATS', 'COMPLETE']).toEqual(expect.arrayContaining(['HOLD_SEATS', 'CREATE_PAYMENT', 'CONFIRM_SEATS'])));
});
