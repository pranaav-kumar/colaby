const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const { AuthenticationError } = require('../utils/errors');
const { JWT_SECRET } = require('../config/env');

describe('authMiddleware', () => {
  test.each(['x-user-id', 'x-userid'])('does not trust %s without a signed token', (header) => {
    const next = jest.fn();
    authMiddleware({ headers: { [header]: 'victim-user' } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  test('accepts a valid bearer token and sets identity from its subject', () => {
    const userId = 'f2f307b1-b1f1-4cda-93a6-d83cc5106278';
    const token = jwt.sign({ sub: userId }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    authMiddleware(req, {}, next);

    expect(req.userId).toBe(userId);
    expect(next).toHaveBeenCalledWith();
  });
});
