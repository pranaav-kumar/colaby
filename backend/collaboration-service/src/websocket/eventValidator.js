const EVENT_TYPES = require('./eventTypes');

/**
 * Validates payload schema based on event type
 */
function validate(type, payload) {
  const errors = [];
  
  // JOIN_VOICE, LEAVE_VOICE, and WHITEBOARD_CLEAR do not require a payload
  if (type === EVENT_TYPES.JOIN_VOICE || type === EVENT_TYPES.LEAVE_VOICE || type === EVENT_TYPES.WHITEBOARD_CLEAR) {
    return { valid: true, errors: [] };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  switch (type) {
    case EVENT_TYPES.CHAT_MESSAGE:
      if (typeof payload.content !== 'string' || payload.content.length < 1 || payload.content.length > 5000) {
        errors.push('Content must be a string between 1 and 5000 characters');
      }
      break;
    case EVENT_TYPES.WHITEBOARD_OBJECT_CREATE:
      if (!payload.objectId || typeof payload.objectId !== 'string') errors.push('Missing or invalid objectId');
      if (!payload.type || typeof payload.type !== 'string') errors.push('Missing or invalid type');
      if (payload.type === 'freehand' || payload.type === 'path') {
        if (!Array.isArray(payload.points) || payload.points.length === 0) {
          errors.push('Missing or empty points array for freehand drawing');
        }
      } else {
        if (typeof payload.x !== 'number') errors.push('Missing or invalid x');
        if (typeof payload.y !== 'number') errors.push('Missing or invalid y');
      }
      break;
    case EVENT_TYPES.WHITEBOARD_OBJECT_UPDATE:
      if (!payload.objectId || typeof payload.objectId !== 'string') errors.push('Missing or invalid objectId');
      if (Object.keys(payload).length < 2) errors.push('Missing at least one updated field');
      break;
    case EVENT_TYPES.WHITEBOARD_OBJECT_DELETE:
      if (!payload.objectId || typeof payload.objectId !== 'string') errors.push('Missing or invalid objectId');
      break;
    case EVENT_TYPES.WHITEBOARD_CURSOR_MOVE:
      if (typeof payload.x !== 'number') errors.push('Missing or invalid x');
      if (typeof payload.y !== 'number') errors.push('Missing or invalid y');
      break;
    case EVENT_TYPES.FILE_CREATE:
    case EVENT_TYPES.FOLDER_CREATE:
      if (!payload.name && !payload.path) {
        errors.push('Missing name or path for file/folder creation');
      }
      break;
    case EVENT_TYPES.FILE_DELETE:
    case EVENT_TYPES.FOLDER_DELETE:
      if (!payload.nodeId && !payload.path) errors.push('Missing nodeId or path');
      break;
    case EVENT_TYPES.FILE_MOVE:
    case EVENT_TYPES.FOLDER_MOVE:
      if (!payload.nodeId && !payload.path) errors.push('Missing nodeId or path');
      break;
    case EVENT_TYPES.FILE_RENAME:
    case EVENT_TYPES.FOLDER_RENAME:
      if (!payload.nodeId && !payload.path) errors.push('Missing nodeId or path');
      if (!payload.newName) errors.push('Missing newName');
      break;
    case EVENT_TYPES.FILE_SAVE:
      if (!payload.path && !payload.filePath) errors.push('Missing path for file save');
      break;
    case EVENT_TYPES.CODE_OPERATION:
      if (!payload.filePath && !payload.path && !payload.fileId) {
        errors.push('Invalid filePath or fileId');
      }
      break;
    case EVENT_TYPES.CODE_CURSOR_MOVE:
    case EVENT_TYPES.CODE_SELECTION_CHANGE:
      if (!payload.filePath && !payload.path && !payload.fileId) errors.push('Missing filePath');
      break;
    case EVENT_TYPES.WORKSPACE_SYNC:
    case EVENT_TYPES.WORKSPACE_INITIALIZED:
      break;
    case EVENT_TYPES.WEBRTC_OFFER:
    case EVENT_TYPES.WEBRTC_ANSWER:
      if (!payload.targetUserId || typeof payload.targetUserId !== 'string') errors.push('Missing targetUserId');
      if (!payload.sdp && !payload.offer && !payload.answer) errors.push('Missing sdp, offer, or answer');
      break;
    case EVENT_TYPES.WEBRTC_ICE_CANDIDATE:
      if (!payload.targetUserId || typeof payload.targetUserId !== 'string') errors.push('Missing targetUserId');
      if (!payload.candidate) errors.push('Missing candidate');
      break;
    case EVENT_TYPES.VOICE_MUTE_STATE:
      break;
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validate };
