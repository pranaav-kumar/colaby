const rateLimit = require('express-rate-limit');

const keyGenerator = (req) => req.userId || req.ip;

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } });
  }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many chat messages' } });
  }
});

module.exports = { apiLimiter, chatLimiter };
