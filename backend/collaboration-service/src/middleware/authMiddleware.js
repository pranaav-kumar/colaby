const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { AuthenticationError } = require('../utils/errors');

/**
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
  // Identity headers are metadata from the gateway, not proof of identity.
  // Always authenticate the caller's signed token at this service boundary.
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const sub = decoded.sub || decoded.userId || decoded.id;
      if (sub) {
        req.userId = String(sub).toLowerCase();
        return next();
      }
    } catch (err) {
      return next(new AuthenticationError('Invalid or expired token'));
    }
  }

  return next(new AuthenticationError('Missing user identity or authentication token'));
}

module.exports = authMiddleware;
