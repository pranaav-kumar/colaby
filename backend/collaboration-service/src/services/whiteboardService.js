const whiteboardManager = require('../collaboration/whiteboard/whiteboardManager');

class WhiteboardService {
  /**
   * Gets the complete whiteboard state for a project
   * @param {string} projectId 
   */
  async getWhiteboardState(projectId) {
    return whiteboardManager.getState(projectId);
  }

  /**
   * Applies an operation and returns the result for broadcasting
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} operation 
   */
  async applyOperation(projectId, userId, operation) {
    const { type, payload } = operation;
    
    switch (type) {
      case 'CREATE':
        return whiteboardManager.handleCreate(projectId, userId, payload);
      case 'UPDATE':
        return whiteboardManager.handleUpdate(projectId, userId, payload);
      case 'DELETE':
        return whiteboardManager.handleDelete(projectId, userId, payload);
      case 'CLEAR':
        return whiteboardManager.handleClear(projectId, userId);
      case 'CURSOR_MOVE':
        return whiteboardManager.handleCursorMove(projectId, userId, payload);
      default:
        throw new Error(`Unknown whiteboard operation type: ${type}`);
    }
  }

  /**
   * Forces persisting the state to MongoDB
   * @param {string} projectId 
   */
  async persistState(projectId) {
    await whiteboardManager.saveSnapshot(projectId);
  }
}

module.exports = new WhiteboardService();
