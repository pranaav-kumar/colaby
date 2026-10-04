const jwt = require('jsonwebtoken');
const { TRUST_GATEWAY_HEADER, JWT_SECRET } = require('../config/env');
const { AuthenticationError } = require('../utils/errors');

/**
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
  // Check X-User-Id header (passed by API Gateway)
  const headerUserId = req.headers['x-user-id'] || req.headers['x-userid'];
  if (headerUserId) {
    req.userId = String(headerUserId).toLowerCase();
    return next();
  }

  // Fallback to Bearer JWT token in Authorization header
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
