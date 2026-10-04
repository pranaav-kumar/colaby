class CursorManager {
  constructor() {
    /** @type {Map<string, Map<string, Map<string, object>>>} projectId -> filePath -> userId -> CursorState */
    this.cursors = new Map();
    
    // Cleanup stale cursors every 15s
    setInterval(() => this._cleanupStale(), 15000);
  }

  /**
   * Deterministically gets a color based on userId hash
   * @param {string} userId 
   */
  getUserColor(userId) {
    const palette = [
      '#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#33FFF5', 
      '#F5FF33', '#9B33FF', '#FF9633', '#33FF96', '#FF3333', 
      '#3333FF', '#33FF33'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  }

  /**
   * Updates cursor position
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} cursorData 
   */
  updateCursor(projectId, userId, cursorData) {
    const { filePath, position, selection, displayName } = cursorData;

    if (!this.cursors.has(projectId)) {
      this.cursors.set(projectId, new Map());
    }
    const projectCursors = this.cursors.get(projectId);

    if (!projectCursors.has(filePath)) {
      projectCursors.set(filePath, new Map());
    }
    const fileCursors = projectCursors.get(filePath);

    fileCursors.set(userId, {
      userId,
      filePath,
      position,
      selection,
      displayName,
      color: this.getUserColor(userId),
      lastUpdate: Date.now()
    });
  }

  /**
   * Removes cursor for a user from all files in a project
   * @param {string} projectId 
   * @param {string} userId 
   */
  removeCursor(projectId, userId) {
    const projectCursors = this.cursors.get(projectId);
    if (!projectCursors) return;

    for (const [filePath, fileCursors] of projectCursors.entries()) {
      fileCursors.delete(userId);
      if (fileCursors.size === 0) {
        projectCursors.delete(filePath);
      }
    }
  }

  /**
   * Gets all cursors for a file
   * @param {string} projectId 
   * @param {string} filePath 
   */
  getCursorsForFile(projectId, filePath) {
    const projectCursors = this.cursors.get(projectId);
    if (!projectCursors) return [];
    
    const fileCursors = projectCursors.get(filePath);
    if (!fileCursors) return [];

    return Array.from(fileCursors.values());
  }

  /**
   * Removes cursors that haven't been updated in 30s
   */
  _cleanupStale() {
    const now = Date.now();
    const threshold = 30000; // 30s

    for (const [projectId, projectCursors] of this.cursors.entries()) {
      for (const [filePath, fileCursors] of projectCursors.entries()) {
        for (const [userId, cursor] of fileCursors.entries()) {
          if (now - cursor.lastUpdate > threshold) {
            fileCursors.delete(userId);
          }
        }
        if (fileCursors.size === 0) {
          projectCursors.delete(filePath);
        }
      }
      if (projectCursors.size === 0) {
        this.cursors.delete(projectId);
      }
    }
  }
}

module.exports = new CursorManager();
