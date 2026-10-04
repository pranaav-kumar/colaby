const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { PORT } = require('./config/env');
const logger = require('./utils/logger');
const { initializeWebSocket } = require('./websocket/websocketServer');
const codeSessionManager = require('./collaboration/code/codeSessionManager');

async function startServer() {
  try {
    await connectDB();
    const server = http.createServer(app);
    
    // Initialize WebSockets
    initializeWebSocket(server);

    server.listen(PORT, () => {
      logger.info(`Collaboration service running on port ${PORT}`);
    });

    const shutdown = async () => {
      logger.info('Gracefully shutting down...');
      await codeSessionManager.flushDirtySessions();
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
