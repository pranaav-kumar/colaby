const path = require('path');

const serviceRoot = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(serviceRoot, '.env') });

// Resolve relative workspace paths from the collaboration service directory,
// not from whichever directory happened to launch Node. The Theia container,
// file APIs, and terminal must all operate on this same directory.
const configuredWorkspaceRoot = process.env.WORKSPACE_ROOT_DIR || './workspaces';

const config = {
  PORT: process.env.PORT || 8090,
  MONGODB_URI: process.env.MONGODB_URI,
  PROJECT_SERVICE_URL: process.env.PROJECT_SERVICE_URL,
  PROJECT_SERVICE_KEY: process.env.PROJECT_SERVICE_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV || 'development',
  TRUST_GATEWAY_HEADER: process.env.TRUST_GATEWAY_HEADER === 'true',
  WORKSPACE_ROOT_DIR: path.isAbsolute(configuredWorkspaceRoot)
    ? configuredWorkspaceRoot
    : path.resolve(serviceRoot, configuredWorkspaceRoot),
};

if (!config.MONGODB_URI || !config.PROJECT_SERVICE_KEY || !config.JWT_SECRET) {
  throw new Error('Missing required environment variables (MONGODB_URI, PROJECT_SERVICE_KEY, JWT_SECRET)');
}

module.exports = config;
