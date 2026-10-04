class PresenceManager {
  constructor() {
    /** @type {Map<string, Map<string, object>>} */
    this.presence = new Map();
    
    // Cleanup interval
    setInterval(() => this.cleanupStale(90000), 30000);
  }

  /**
   * Handles user connection
   * @param {string} projectId 
   * @param {string} userId 
   */
  userConnected(projectId, userId) {
    if (!this.presence.has(projectId)) {
      this.presence.set(projectId, new Map());
    }
    
    const projectPresence = this.presence.get(projectId);
    const existingState = projectPresence.get(userId);

    if (existingState) {
      existingState.connectionCount += 1;
      existingState.lastActivity = Date.now();
    } else {
      projectPresence.set(userId, {
        userId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        activeSection: null,
        activeFile: null,
        connectionCount: 1
      });
    }
  }

  /**
   * Handles user disconnection
   * @param {string} projectId 
   * @param {string} userId 
   */
  userDisconnected(projectId, userId) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return;

    const state = projectPresence.get(userId);
    if (state) {
      state.connectionCount -= 1;
      if (state.connectionCount <= 0) {
        projectPresence.delete(userId);
      } else {
        state.lastActivity = Date.now();
      }
    }

    if (projectPresence.size === 0) {
      this.presence.delete(projectId);
    }
  }

  /**
   * Updates user activity state
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} activity 
   */
  updateActivity(projectId, userId, { activeSection, activeFile }) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return;

    const state = projectPresence.get(userId);
    if (state) {
      if (activeSection !== undefined) state.activeSection = activeSection;
      if (activeFile !== undefined) state.activeFile = activeFile;
      state.lastActivity = Date.now();
    }
  }

  /**
   * Heartbeat to update last activity
   * @param {string} projectId 
   * @param {string} userId 
   */
  heartbeat(projectId, userId) {
    const projectPresence = this.presence.get(projectId);
    if (projectPresence) {
      const state = projectPresence.get(userId);
      if (state) {
        state.lastActivity = Date.now();
      }
    }
  }

  /**
   * Gets all presence for a project
   * @param {string} projectId 
   */
  getPresence(projectId) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return [];
    return Array.from(projectPresence.values());
  }

  /**
   * Checks if user is present
   * @param {string} projectId 
   * @param {string} userId 
   */
  isUserPresent(projectId, userId) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return false;
    
    const state = projectPresence.get(userId);
    return state ? state.connectionCount > 0 : false;
  }

  /**
   * Cleans up stale connections
   * @param {number} maxAge 
   */
  cleanupStale(maxAge = 90000) {
    const now = Date.now();
    
    for (const [projectId, projectPresence] of this.presence.entries()) {
      for (const [userId, state] of projectPresence.entries()) {
        if (now - state.lastActivity > maxAge) {
          projectPresence.delete(userId);
        }
      }
      if (projectPresence.size === 0) {
        this.presence.delete(projectId);
      }
    }
  }
}

module.exports = new PresenceManager();
