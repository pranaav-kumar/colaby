'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const { JWT_SECRET, WORKSPACE_ROOT_DIR } = require('../config/env');
const Workspace = require('../models/Workspace');
const projectServiceClient = require('../integrations/projectService/projectServiceClient');
const logger = require('../utils/logger');

const terminalWss = new WebSocketServer({ noServer: true });

// Active sessions tracking: sessionId -> { ws, ptyProcess, projectId, userId }
const activeSessions = new Map();

/**
 * Creates a scoped terminal session token
 */
function createTerminalToken(userId, projectId) {
  return jwt.sign(
    {
      userId: String(userId).toLowerCase(),
      projectId,
      scope: 'terminal_access'
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Handles HTTP upgrade for /terminal-pty
 */
async function handleUpgrade(request, socket, head) {
  try {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url, `http://${host}`);
    const projectId = url.searchParams.get('projectId');
    const token = url.searchParams.get('token') ||
      (request.headers.authorization && request.headers.authorization.startsWith('Bearer ')
        ? request.headers.authorization.split(' ')[1]
        : null);

    if (!projectId || !token) {
      logger.warn(`[Terminal] Upgrade rejected: missing projectId (${projectId}) or token`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      logger.warn(`[Terminal] Upgrade rejected: invalid token: ${jwtErr.message}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    const rawUserId = decoded.sub || decoded.userId || decoded.id;
    if (!rawUserId) {
      logger.warn(`[Terminal] Upgrade rejected: no user ID in JWT payload`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    const userId = String(rawUserId).toLowerCase();

    // Verify project scoping if present in token
    if (decoded.projectId && decoded.projectId !== projectId) {
      logger.warn(`[Terminal] Upgrade rejected: token project mismatch (${decoded.projectId} != ${projectId})`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }

    // Verify project membership (bypass for container internal token)
    if (userId !== 'container') {
      const isMember = await projectServiceClient.isProjectMember(projectId, userId);
      if (!isMember) {
        logger.warn(`[Terminal] Upgrade forbidden: User ${userId} is not a member of project ${projectId}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        return socket.destroy();
      }
    }

    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request, { userId, projectId });
    });
  } catch (err) {
    logger.error(`[Terminal] Upgrade error: ${err.message}`);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
}

terminalWss.on('connection', async (ws, request, { userId, projectId }) => {
  const sessionId = `term-${projectId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const workspace = await Workspace.findOne({ projectId }).catch(() => null);
  const workspaceDir = path.resolve(workspace?.repoPath || path.join(WORKSPACE_ROOT_DIR, projectId));

  if (!fs.existsSync(workspaceDir)) {
    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
    } catch (mkdirErr) {
      logger.error(`[Terminal] Could not create workspaceDir ${workspaceDir}: ${mkdirErr.message}`);
    }
  }

  const shell = process.platform === 'win32'
    ? (process.env.COLABY_TERMINAL_SHELL || 'powershell.exe')
    : (process.env.COLABY_TERMINAL_SHELL || process.env.SHELL || '/bin/bash');
  const shellArgs = process.platform === 'win32' ? ['-NoLogo'] : ['-l'];
  logger.info(`[Terminal] Spawning host shell ${shell} for session ${sessionId} in ${workspaceDir}`);

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workspaceDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLABY_WORKSPACE: workspaceDir,
        COLABY_PROJECT_ID: projectId,
        COLABY_USER_ID: userId
      },
      ...(process.platform === 'win32' ? { useConpty: false } : {})
    });
  } catch (spawnErr) {
    logger.error(`[Terminal] Failed to spawn host shell ${shell}: ${spawnErr.message}`);
    ws.send(JSON.stringify({ type: 'output', data: `\r\n[Colaby] Failed to start local shell ${shell}: ${spawnErr.message}\r\n` }));
    ws.close();
    return;
  }

  activeSessions.set(sessionId, { ws, ptyProcess, projectId, userId });

  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'output', data }));
      } catch (sendErr) {
        logger.warn(`[Terminal] Send error on session ${sessionId}: ${sendErr.message}`);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    logger.info(`[Terminal] PTY exited for session ${sessionId} (exitCode: ${exitCode})`);
    activeSessions.delete(sessionId);
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
        ws.close();
      } catch (_) {}
    }
  });

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'input' && typeof msg.data === 'string') {
        ptyProcess.write(msg.data);
      } else if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
        const c = Math.max(1, Math.min(500, msg.cols));
        const r = Math.max(1, Math.min(200, msg.rows));
        ptyProcess.resize(c, r);
      }
    } catch (err) {
      logger.warn(`[Terminal] Malformed message in session ${sessionId}: ${err.message}`);
    }
  });

  ws.on('close', () => {
    logger.info(`[Terminal] WebSocket closed for session ${sessionId}`);
    activeSessions.delete(sessionId);
    try {
      ptyProcess.kill();
    } catch (_) {}
  });

  ws.on('error', (err) => {
    logger.error(`[Terminal] WebSocket error for session ${sessionId}: ${err.message}`);
    activeSessions.delete(sessionId);
    try {
      ptyProcess.kill();
    } catch (_) {}
  });
});

module.exports = {
  createTerminalToken,
  handleUpgrade,
  activeSessions
};
