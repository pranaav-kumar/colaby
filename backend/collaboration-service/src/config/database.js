const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');
const logger = require('../utils/logger');

/**
 * Connects to MongoDB with retry logic
 * @returns {Promise<void>}
 */
async function connectDB(retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI);
      logger.info('Connected to MongoDB');
      return;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = { connectDB };
