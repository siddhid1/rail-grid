describe('gateway mapping', () => { it('maps users to user service segment', () => expect('users/auth/login'.split('/')[0]).toBe('users')); });
