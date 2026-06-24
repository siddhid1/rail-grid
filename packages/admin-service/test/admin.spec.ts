describe('admin route validation', () => {
  it('requires continuous route sequence numbers', () => {
    const stations = [{ sequenceNumber: 1 }, { sequenceNumber: 3 }];
    const valid = [...stations].sort((a, b) => a.sequenceNumber - b.sequenceNumber).every((s, index) => s.sequenceNumber === index + 1);
    expect(valid).toBe(false);
  });
});
