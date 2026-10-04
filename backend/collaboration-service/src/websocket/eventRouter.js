const EVENT_TYPES = require('./eventTypes');
const connectionHandler = require('./connectionHandler');
const eventValidator = require('./eventValidator');
const logger = require('../utils/logger');
const snapshotService = require('../services/snapshotService');
const whiteboardService = require('../services/whiteboardService');
const chatService = require('../services/chatService');
const voiceSignaling = require('../collaboration/voice/voiceSignaling');
const fileSystemManager = require('../collaboration/filesystem/fileSystemManager');
const workspaceService = require('../services/workspaceService');
const codeSessionManager = require('../collaboration/code/codeSessionManager');

// Rate limiting (simple placeholder)
const rateLimiter = new Map();
function isRateLimited(userId, type) {
  // simple dummy rate limit implementation
  return false;
}

async function route(ws, message, context) {
  const { type, payload } = message;
  const { userId, projectId, broadcast, sendToUser } = context;

  if (!type) return;

  if (type === EVENT_TYPES.HEARTBEAT || type === EVENT_TYPES.HEARTBEAT_ACK) {
    connectionHandler.updateHeartbeat(ws);
    if (type === EVENT_TYPES.HEARTBEAT) {
      ws.send(JSON.stringify({ type: EVENT_TYPES.HEARTBEAT_ACK }));
    }
    return;
  }

  if (isRateLimited(userId, type)) {
    return ws.send(JSON.stringify({ type: EVENT_TYPES.ERROR, payload: { message: 'Rate limited' } }));
  }

  const { valid, errors } = eventValidator.validate(type, payload);
  if (!valid) {
    ws.send(JSON.stringify({ type: EVENT_TYPES.ERROR, payload: { message: 'Validation failed', errors } }));
    return;
  }

  // Override userId and projectId
  const safePayload = payload ? { ...payload, userId, projectId } : { userId, projectId };
  const safeMessage = { type, payload: safePayload };

  const meaningfulOps = [
    EVENT_TYPES.FILE_CREATE, EVENT_TYPES.FILE_DELETE, EVENT_TYPES.FILE_MOVE, EVENT_TYPES.FILE_RENAME,
    EVENT_TYPES.FOLDER_CREATE, EVENT_TYPES.FOLDER_DELETE, EVENT_TYPES.FOLDER_MOVE, EVENT_TYPES.FOLDER_RENAME,
    EVENT_TYPES.WHITEBOARD_OBJECT_CREATE, EVENT_TYPES.WHITEBOARD_OBJECT_UPDATE, EVENT_TYPES.WHITEBOARD_OBJECT_DELETE
  ];

  try {
    if (meaningfulOps.includes(type)) {
      await snapshotService.persistEvent({
        projectId,
        userId,
        type,
        logicalTimestamp: Date.now(),
        payload: safePayload
      });
    }

    switch (type) {
      case EVENT_TYPES.CHAT_MESSAGE: {
        try {
          const savedMsg = await chatService.sendMessage(projectId, userId, safePayload.content);
          broadcast(projectId, {
            type: EVENT_TYPES.CHAT_MESSAGE,
            payload: {
              messageId: savedMsg.messageId,
              projectId: savedMsg.projectId,
              senderId: savedMsg.senderId,
              userId: savedMsg.senderId,
              content: savedMsg.content,
              createdAt: savedMsg.createdAt
            }
          });
        } catch (e) {
          logger.error('Chat message processing error:', e.message);
          ws.send(JSON.stringify({
            type: EVENT_TYPES.ERROR,
            payload: { message: e.message || 'Failed to send chat message' }
          }));
        }
        break;
      }
        
      case EVENT_TYPES.WHITEBOARD_OBJECT_CREATE: {
        try {
          await whiteboardService.applyOperation(projectId, userId, { type: 'CREATE', payload: safePayload });
        } catch (e) {
          logger.warn('Whiteboard create error:', e.message);
        }
        broadcast(projectId, safeMessage, userId);
        break;
      }
      case EVENT_TYPES.WHITEBOARD_OBJECT_UPDATE: {
        try {
          await whiteboardService.applyOperation(projectId, userId, { type: 'UPDATE', payload: safePayload });
        } catch (e) {
          logger.warn('Whiteboard update error:', e.message);
        }
        broadcast(projectId, safeMessage, userId);
        break;
      }
      case EVENT_TYPES.WHITEBOARD_OBJECT_DELETE: {
        try {
          await whiteboardService.applyOperation(projectId, userId, { type: 'DELETE', payload: safePayload });
        } catch (e) {
          logger.warn('Whiteboard delete error:', e.message);
        }
        broadcast(projectId, safeMessage, userId);
        break;
      }
      case EVENT_TYPES.WHITEBOARD_CLEAR: {
        try {
          await whiteboardService.applyOperation(projectId, userId, { type: 'CLEAR', payload: safePayload });
        } catch (e) {
          logger.warn('Whiteboard clear error:', e.message);
        }
        broadcast(projectId, safeMessage, userId);
        break;
      }
      case EVENT_TYPES.WHITEBOARD_CURSOR_MOVE: {
        try {
          await whiteboardService.applyOperation(projectId, userId, { type: 'CURSOR_MOVE', payload: safePayload });
        } catch (e) {
          // ignore cursor throttle
        }
        broadcast(projectId, safeMessage, userId);
        break;
      }

      // File & Folder Operations via Tree-CRDT
      case EVENT_TYPES.FILE_CREATE:
      case EVENT_TYPES.FOLDER_CREATE:
      case EVENT_TYPES.FILE_DELETE:
      case EVENT_TYPES.FOLDER_DELETE:
      case EVENT_TYPES.FILE_RENAME:
      case EVENT_TYPES.FOLDER_RENAME:
      case EVENT_TYPES.FILE_MOVE:
      case EVENT_TYPES.FOLDER_MOVE: {
        try {
          const result = await fileSystemManager.handleFileOperation(projectId, userId, {
            type,
            payload: safePayload
          });
          broadcast(projectId, {
            type,
            payload: {
              ...safePayload,
              ...result,
              userId
            }
          });
        } catch (err) {
          logger.error(`Error handling ${type}:`, err.message);
          ws.send(JSON.stringify({
            type: EVENT_TYPES.ERROR,
            payload: { message: err.message || `Failed to process ${type}` }
          }));
        }
        break;
      }

      // Collaborative Code Editing Operations with Yjs/CRDT support
      case EVENT_TYPES.CODE_OPERATION: {
        const targetPath = safePayload.filePath || safePayload.path;
        const roomId = `${projectId}:${targetPath}`;
        const updateId = safePayload.updateId || `${userId}-${Date.now()}`;
        const serverReceiveTs = Date.now();

        const updateBuf = safePayload.update
          ? (Buffer.isBuffer(safePayload.update) ? safePayload.update : Buffer.from(safePayload.update, 'base64'))
          : null;

        // ── [COLAB-LIVE] SERVER_RECEIVE ──────────────────────────────────────
        logger.info('[COLAB-LIVE] SERVER_RECEIVE', {
          updateId,
          userId,
          filePath: targetPath,
          canonicalPath: targetPath,
          ydocKey: roomId,
          modelUri: safePayload.modelUri || '',
          modelVersionId: safePayload.modelVersionId || 0,
          timestamp: new Date(serverReceiveTs).toISOString()
        });

        if (updateBuf) {
          try {
            await codeSessionManager.handleCodeOperation(projectId, userId, {
              filePath: targetPath,
              update: updateBuf
            });
          } catch (err) {
            logger.error('[COLAB-LIVE] SERVER_YJS_APPLY_ERROR', { updateId, error: err.message });
          }
        }

        // Enrich the message with server-side metadata before broadcast
        const enrichedPayload = {
          ...safePayload,
          updateId,
          serverReceiveTimestamp: serverReceiveTs
        };
        const enrichedMessage = { type, payload: enrichedPayload };

        // Broadcast to all other collaborators
        const broadcastResult = broadcast(projectId, enrichedMessage, ws);
        const broadcastTs = Date.now();

        // ── [COLAB-LIVE] SERVER_BROADCAST ────────────────────────────────────
        logger.info('[COLAB-LIVE] SERVER_BROADCAST', {
          updateId,
          userId,
          filePath: targetPath,
          canonicalPath: targetPath,
          ydocKey: roomId,
          modelUri: safePayload.modelUri || '',
          modelVersionId: safePayload.modelVersionId || 0,
          recipients: broadcastResult.recipientUserIds,
          timestamp: new Date(broadcastTs).toISOString()
        });

        if (broadcastResult.recipientCount === 0) {
          logger.warn('[COLAB-LIVE] NO_RECIPIENTS — sender is the only online member', { room: roomId, updateId });
        }

        break;
      }

      case EVENT_TYPES.CODE_SYNC: {
        try {
          const targetPath = safePayload.filePath || safePayload.path;
          const session = await codeSessionManager.getOrCreateSession(projectId, targetPath);
          if (session.text.length === 0 && safePayload.clientContent) {
            session.loadContent(safePayload.clientContent);
          }
          const encodedState = session.getEncodedState();
          ws.send(JSON.stringify({
            type: EVENT_TYPES.CODE_SYNC,
            payload: {
              filePath: targetPath,
              encodedState: encodedState.toString('base64'),
              content: session.getContent()
            }
          }));
        } catch (err) {
          logger.error('Error handling CODE_SYNC:', err.message);
        }
        break;
      }

      case EVENT_TYPES.FILE_SAVE: {
        try {
          const targetPath = safePayload.filePath || safePayload.path;
          if (targetPath) {
            await workspaceService.saveFileContent(projectId, targetPath, safePayload.content ?? '', userId);
          }
          broadcast(projectId, safeMessage, userId);
        } catch (err) {
          logger.error('Error saving file:', err.message);
        }
        break;
      }

      case EVENT_TYPES.CODE_CURSOR_MOVE:
      case EVENT_TYPES.CODE_SELECTION_CHANGE: {
        // Ephemeral awareness / cursor presence — no DB persistence
        broadcast(projectId, safeMessage, userId);
        break;
      }

      case EVENT_TYPES.WORKSPACE_INITIALIZED:
      case EVENT_TYPES.WORKSPACE_SYNC: {
        try {
          const tree = await fileSystemManager.getFileTree(projectId);
          broadcast(projectId, {
            type: EVENT_TYPES.WORKSPACE_SYNC,
            payload: { tree }
          });
        } catch (err) {
          logger.error('Error handling workspace sync:', err.message);
        }
        break;
      }

      case EVENT_TYPES.JOIN_VOICE: {
        const result = voiceSignaling.joinVoice(projectId, userId);
        if (result) {
          broadcast(projectId, { type: EVENT_TYPES.VOICE_STATE, payload: result });
        }
        break;
      }
      
      case EVENT_TYPES.LEAVE_VOICE: {
        const result = voiceSignaling.leaveVoice(projectId, userId);
        if (result) {
          broadcast(projectId, { type: EVENT_TYPES.VOICE_STATE, payload: result });
        }
        break;
      }

      case EVENT_TYPES.VOICE_MUTE_STATE: {
        voiceSignaling.updateMuteState(projectId, userId, payload || {});
        broadcast(projectId, {
          type: EVENT_TYPES.VOICE_MUTE_STATE,
          payload: {
            userId,
            isMuted: payload.isMuted,
            isDeafened: payload.isDeafened,
            isScreenSharing: payload.isScreenSharing
          }
        });
        break;
      }

      case EVENT_TYPES.WEBRTC_OFFER: {
        const sdp = payload.sdp || payload.offer;
        const targetUserId = payload.targetUserId;
        const offer = voiceSignaling.handleOffer(projectId, userId, targetUserId, sdp);
        if (offer) {
          sendToUser(projectId, targetUserId, {
            type: EVENT_TYPES.WEBRTC_OFFER,
            payload: {
              fromUserId: userId,
              userId: userId,
              targetUserId,
              sdp,
              offer: sdp
            }
          });
        }
        break;
      }

      case EVENT_TYPES.WEBRTC_ANSWER: {
        const sdp = payload.sdp || payload.answer;
        const targetUserId = payload.targetUserId;
        const answer = voiceSignaling.handleAnswer(projectId, userId, targetUserId, sdp);
        if (answer) {
          sendToUser(projectId, targetUserId, {
            type: EVENT_TYPES.WEBRTC_ANSWER,
            payload: {
              fromUserId: userId,
              userId: userId,
              targetUserId,
              sdp,
              answer: sdp
            }
          });
        }
        break;
      }

      case EVENT_TYPES.WEBRTC_ICE_CANDIDATE: {
        const targetUserId = payload.targetUserId;
        const candidate = payload.candidate;
        const relayed = voiceSignaling.handleIceCandidate(projectId, userId, targetUserId, candidate);
        if (relayed) {
          sendToUser(projectId, targetUserId, {
            type: EVENT_TYPES.WEBRTC_ICE_CANDIDATE,
            payload: {
              fromUserId: userId,
              userId: userId,
              targetUserId,
              candidate
            }
          });
        }
        break;
      }

      default:
        broadcast(projectId, safeMessage, userId);
    }
  } catch (error) {
    logger.error(`Error routing event ${type}:`, error);
    ws.send(JSON.stringify({ type: EVENT_TYPES.ERROR, payload: { message: 'Internal server error processing event' } }));
  }
}

module.exports = { route };
