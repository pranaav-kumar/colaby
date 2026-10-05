require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/errorMiddleware');
const securityHeaders = require('./middleware/securityHeaders');
const { validateWorkspaceParams } = require('./middleware/payloadValidator');
const { THEIA_PARENT_ORIGINS } = require('./config/env');

const workspaceRoutes = require('./routes/workspaceRoutes');
const chatRoutes = require('./routes/chatRoutes');
const whiteboardRoutes = require('./routes/whiteboardRoutes');

const app = express();

app.use(helmet());

// Dynamic CORS middleware: avoid double-headers when proxied through API Gateway
app.use((req, res, next) => {
  if (req.headers['x-forwarded-host'] || req.headers['x-forwarded-for'] || req.headers['x-user-id']) {
    // Behind Gateway -> Gateway already handles and attaches CORS headers
    return next();
  }
  return cors({
    origin: THEIA_PARENT_ORIGINS,
    credentials: true
  })(req, res, next);
});

app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  logger.info('Request received', { method: req.method, url: req.url, userId: req.userId || 'anonymous' });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'collaboration-service', timestamp: new Date().toISOString() });
});

// Setup workspace API router supporting both direct and gateway-prefixed paths
const workspaceApiRouter = express.Router();
workspaceApiRouter.use('/:projectId', validateWorkspaceParams);
workspaceApiRouter.use('/:projectId/chat', chatRoutes);
if (whiteboardRoutes) {
  workspaceApiRouter.use('/:projectId/whiteboard', whiteboardRoutes);
}
workspaceApiRouter.use('/', workspaceRoutes);

// Mount router on both paths for maximum compatibility
app.use('/collaboration/api/workspaces', workspaceApiRouter);
app.use('/api/workspaces', workspaceApiRouter);

app.use(errorMiddleware);

module.exports = app;
