'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const projectServiceClient = require('../integrations/projectService/projectServiceClient');
const logger = require('../utils/logger');
const EVENT_TYPES = require('./eventTypes');
const connectionHandler = require('./connectionHandler');
const eventRouter = require('./eventRouter');
const voiceSignaling = require('../collaboration/voice/voiceSignaling');

const rooms = new Map(); // projectId -> Set<ws>

function getRoomSockets(projectId) {
  return rooms.get(projectId) || new Set();
}

function getRoomMembers(projectId) {
  const sockets = getRoomSockets(projectId);
  const userIds = new Set();
  for (const ws of sockets) {
    if (ws.userId && ws.readyState === 1) {
      userIds.add(ws.userId);
    }
  }
  return userIds;
}

/**
 * Broadcast a message to all room members (optionally excluding the sender).
 * Returns { recipientUserIds: string[], recipientCount: number } for audit logging.
 */
function broadcast(projectId, message, exclude = null) {
  const room = getRoomSockets(projectId);
  if (!room || room.size === 0) return { recipientUserIds: [], recipientCount: 0 };

  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
  const recipientUserIds = [];

  for (const ws of room) {
    if (ws.readyState === 1) {
      // exclude can be a ws instance or a userId string
      if (exclude) {
        if (typeof exclude === 'string' && ws.userId === exclude.toLowerCase()) continue;
        if (typeof exclude === 'object' && ws === exclude) continue;
      }
      recipientUserIds.push(ws.userId);
      try {
        ws.send(msgStr);
      } catch (err) {
        logger.error('Failed to send message to client:', err.message);
      }
    }
  }

  return { recipientUserIds, recipientCount: recipientUserIds.length };
}

function sendToUser(projectId, userId, message) {
  const room = getRoomSockets(projectId);
  if (!room || room.size === 0) return;

  const targetId = String(userId).toLowerCase();
  const msgStr = typeof message === 'string' ? message : JSON.stringify(message);

  for (const ws of room) {
    if (ws.userId === targetId && ws.readyState === 1) {
      try {
        ws.send(msgStr);
      } catch (err) {
        logger.error(`Failed to send message to user ${userId}:`, err.message);
      }
    }
  }
}

const terminalServer = require('../services/terminalServer');

function initializeWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url, `http://${host}`);

      if (url.pathname === '/terminal-pty' || url.pathname.startsWith('/terminal/')) {
        return await terminalServer.handleUpgrade(request, socket, head);
      }
      const segments = url.pathname.split('/').filter(Boolean);
      const projectId = segments[segments.length - 1];
      const token = url.searchParams.get('token') || (request.headers.authorization && request.headers.authorization.startsWith('Bearer ') ? request.headers.authorization.split(' ')[1] : null);

      if (!projectId || !token) {
        logger.warn(`WebSocket upgrade rejected: missing projectId (${projectId}) or token`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const rawUserId = decoded.sub || decoded.userId || decoded.id;
      if (!rawUserId) {
        logger.warn(`WebSocket upgrade rejected: No user ID in JWT payload`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
      }
      const userId = String(rawUserId).toLowerCase();

      const isMember = await projectServiceClient.isProjectMember(projectId, userId);
      if (!isMember) {
        logger.warn(`WebSocket upgrade forbidden: User ${userId} is not a member of project ${projectId}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        return socket.destroy();
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = userId;
        ws.projectId = projectId;
        wss.emit('connection', ws, request, { userId, projectId });
      });
    } catch (err) {
      logger.error('WebSocket upgrade failed:', err.message);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, { userId, projectId }) => {
    logger.info(`WebSocket connected: ${userId} in ${projectId}`);

    ws.userId = userId;
    ws.projectId = projectId;

    if (!rooms.has(projectId)) rooms.set(projectId, new Set());
    rooms.get(projectId).add(ws);

    connectionHandler.initConnection(ws, userId, projectId);

    const currentMembers = Array.from(getRoomMembers(projectId));

    ws.send(JSON.stringify({
      type: EVENT_TYPES.CONNECTION_ACK,
      payload: {
        userId,
        projectId,
        onlineUsers: currentMembers
      }
    }));

    broadcast(projectId, {
      type: EVENT_TYPES.USER_JOINED,
      payload: {
        userId,
        projectId,
        onlineUsers: currentMembers
      }
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await eventRouter.route(ws, message, { userId, projectId, broadcast, sendToUser });
      } catch (err) {
        ws.send(JSON.stringify({ type: EVENT_TYPES.ERROR, payload: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      logger.info(`WebSocket disconnected: ${userId} from ${projectId}`);
      const room = rooms.get(projectId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(projectId);
      }
      connectionHandler.cleanup(ws);

      const updatedMembers = Array.from(getRoomMembers(projectId));
      const remainingSockets = room ? Array.from(room).filter(s => String(s.userId).toLowerCase() === String(userId).toLowerCase() && s.readyState === 1) : [];
      if (remainingSockets.length === 0) {
        const voiceLeft = voiceSignaling.leaveVoice(projectId, userId);
        if (voiceLeft) {
          broadcast(projectId, { type: EVENT_TYPES.VOICE_STATE, payload: voiceLeft });
        }
        broadcast(projectId, {
          type: EVENT_TYPES.USER_LEFT,
          payload: {
            userId: String(userId).toLowerCase(),
            projectId,
            onlineUsers: updatedMembers
          }
        });
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      ws.close();
    });
  });
}

module.exports = {
  initializeWebSocket,
  broadcast,
  sendToUser,
  getRoomMembers,
  getRoomSockets
};
