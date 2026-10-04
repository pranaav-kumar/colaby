const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const { NODE_ENV } = require('../config/env');

/**
 * Express error handling middleware
 */
function errorMiddleware(err, req, res, next) {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, ...(NODE_ENV === 'development' && { stack: err.stack }) }
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' } });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      ...(NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}

module.exports = errorMiddleware;
