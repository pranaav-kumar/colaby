const winston = require('winston');
const { NODE_ENV } = require('../config/env');

const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    NODE_ENV === 'production' ? winston.format.json() : winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    )
  ),
  transports: [new winston.transports.Console()]
});

/**
 * Creates a child logger with context
 * @param {Object} context - Metadata like projectId, userId
 * @returns {winston.Logger} Child logger instance
 */
logger.withContext = (context) => {
  return logger.child(context);
};

module.exports = logger;
