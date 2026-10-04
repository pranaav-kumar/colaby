const fs = require('fs');
const path = require('path');
const CollaborativeCodeEditor = require('./codeEditor');
const CodeDocument = require('../../models/CodeDocument');
const Workspace = require('../../models/Workspace');
const { sanitizePath } = require('../../utils/pathSecurity');
const logger = require('../../utils/logger');
const { WORKSPACE_ROOT_DIR } = require('../../config/env');

function getWorkspaceDir(projectId) {
  return path.resolve(WORKSPACE_ROOT_DIR, projectId);
}

class CodeSessionManager {
  constructor() {
    /** @type {Map<string, CollaborativeCodeEditor>} */
    this.sessions = new Map();
    this.saveTimers = new Map();
  }

  _getSessionKey(projectId, filePath) {
    return `${projectId}:${filePath}`;
  }

  /**
   * Gets or creates a code editing session
   * @param {string} projectId 
   * @param {string} filePath 
   */
  async getOrCreateSession(projectId, filePath) {
    const key = this._getSessionKey(projectId, filePath);
    
    if (!this.sessions.has(key)) {
      const editor = new CollaborativeCodeEditor(projectId, filePath);
      
      try {
        const doc = await CodeDocument.findOne({ projectId, filePath });
        
        if (doc && doc.yjsUpdate) {
          editor.applyUpdate(doc.yjsUpdate);
          editor.dirty = false;
        } else {
          // If no doc in DB, load initial content from disk
          try {
            const workspace = await Workspace.findOne({ projectId });
            const repoDir = (workspace && workspace.repoPath) || getWorkspaceDir(projectId);
            if (repoDir) {
              const safePath = sanitizePath(filePath, repoDir);
              if (fs.existsSync(safePath)) {
                const content = fs.readFileSync(safePath, 'utf8');
                editor.loadContent(content);
              }
            }
          } catch (diskErr) {
            logger.warn(`Could not load file from disk for ${key}:`, diskErr.message);
          }
        }
      } catch (err) {
        logger.error(`Error loading session for ${key}:`, err);
      }
      
      this.sessions.set(key, editor);
    }
    
    return this.sessions.get(key);
  }

  /**
   * Handles a code operation (Yjs update)
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} data 
   */
  async handleCodeOperation(projectId, userId, { filePath, update }) {
    const session = await this.getOrCreateSession(projectId, filePath);
    session.applyUpdate(update);
    this.scheduleSave(projectId, filePath);
    return session.getUpdateSince(); // In a real scenario, you'd calculate diff or broadcast the exact update
  }

  /** Persist the merged CRDT state and file contents after a short quiet period. */
  scheduleSave(projectId, filePath, delayMs = 750) {
    const key = this._getSessionKey(projectId, filePath);
    const existingTimer = this.saveTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      this.saveTimers.delete(key);
      try {
        await this.saveSession(projectId, filePath);
      } catch (err) {
        logger.error(`Debounced save failed for ${key}:`, err);
        this.scheduleSave(projectId, filePath, 3000);
      }
    }, delayMs);
    // A pending save should not keep the service alive during shutdown.
    if (typeof timer.unref === 'function') timer.unref();
    this.saveTimers.set(key, timer);
  }

  /**
   * Handles cursor update
   */
  async handleCursorUpdate(projectId, userId, { filePath, position, selection }) {
    const session = await this.getOrCreateSession(projectId, filePath);
    session.updateCursor(userId, { position, selection });
  }

  /**
   * Removes cursor
   */
  async handleCursorRemove(projectId, userId, filePath) {
    const session = await this.getOrCreateSession(projectId, filePath);
    session.removeCursor(userId);
  }

  /**
   * Gets initial session state
   */
  async getSessionState(projectId, filePath) {
    const session = await this.getOrCreateSession(projectId, filePath);
    return {
      encodedState: session.getEncodedState(),
      stateVector: session.getStateVector(),
      cursors: session.getCursors()
    };
  }

  /**
   * Saves a session to DB and disk
   */
  async saveSession(projectId, filePath) {
    const key = this._getSessionKey(projectId, filePath);
    const session = this.sessions.get(key);
    
    if (!session || !session.dirty) return;

    const savedRevision = session.revision;
    const encodedState = session.getEncodedState();
    const content = session.getContent();

    try {
      // Save to MongoDB
      await CodeDocument.findOneAndUpdate(
        { projectId, filePath },
        { 
          yjsUpdate: encodedState,
          yjsStateVector: session.getStateVector(),
          version: Date.now(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Save to disk if workspace directory exists
      try {
        const workspace = await Workspace.findOne({ projectId });
        const repoDir = (workspace && workspace.repoPath) || getWorkspaceDir(projectId);
        if (repoDir) {
          const safePath = sanitizePath(filePath, repoDir);
          const dir = path.dirname(safePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          logger.info(`[COLABY_FS_WRITE]`, {
            timestamp: new Date().toISOString(),
            workspaceId: projectId,
            filePath,
            caller: 'codeSessionManager.saveSession',
            origin: 'EXPLICIT_SAVE',
            contentLength: content.length
          });
          fs.writeFileSync(safePath, content, 'utf8');
        }
      } catch (diskErr) {
        logger.warn(`Could not sync file to disk for ${key}:`, diskErr.message);
        throw diskErr;
      }

      session.lastSaved = Date.now();
      session.dirty = session.revision !== savedRevision;
      if (session.dirty) this.scheduleSave(projectId, filePath);
    } catch (err) {
      logger.error(`Error saving session ${key}:`, err);
      session.dirty = true;
      this.scheduleSave(projectId, filePath, 3000);
    }
  }

  async _periodicSave() {
    for (const [key, session] of this.sessions.entries()) {
      if (session.dirty) {
        const { projectId, filePath } = session;
        await this.saveSession(projectId, filePath);
      }
    }
  }

  async flushDirtySessions() {
    for (const session of this.sessions.values()) {
      if (session.dirty) {
        await this.saveSession(session.projectId, session.filePath);
      }
    }
  }

  /**
   * Closes a session after a grace period
   */
  async closeSession(projectId, filePath) {
    const key = this._getSessionKey(projectId, filePath);
    setTimeout(async () => {
      const timer = this.saveTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.saveTimers.delete(key);
      }
      await this.saveSession(projectId, filePath);
      const session = this.sessions.get(key);
      if (session) {
        session.destroy();
        this.sessions.delete(key);
      }
    }, 30000); // 30s grace period
  }

  /**
   * Cleans up all sessions for a project
   */
  async cleanup(projectId) {
    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        const timer = this.saveTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.saveTimers.delete(key);
        }
        await this.saveSession(projectId, session.filePath);
        session.destroy();
        this.sessions.delete(key);
      }
    }
  }
}

module.exports = new CodeSessionManager();
