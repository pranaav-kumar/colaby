const { LamportClock } = require('../ordering/logicalClock');
const WhiteboardDocument = require('../../models/WhiteboardDocument');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');

class WhiteboardManager {
  constructor() {
    /** @type {Map<string, { objects: Map<string, object>, cursors: Map<string, object>, dirty: boolean, lastSave: Date, clock: LamportClock }>} */
    this.inMemoryState = new Map();
    this.saveInterval = setInterval(() => this._periodicSave(), 30000);
  }

  /**
   * Initializes state for a project if not exists
   * @param {string} projectId 
   */
  async _initState(projectId) {
    if (!this.inMemoryState.has(projectId)) {
      let doc = await WhiteboardDocument.findOne({ projectId });
      const objects = new Map();
      if (doc) {
        doc.objects.forEach(obj => {
          objects.set(obj.objectId, obj.toObject());
        });
      } else {
        doc = new WhiteboardDocument({ projectId, objects: [] });
        await doc.save();
      }
      this.inMemoryState.set(projectId, {
        objects,
        cursors: new Map(),
        dirty: false,
        lastSave: new Date(),
        clock: new LamportClock()
      });
    }
    return this.inMemoryState.get(projectId);
  }

  /**
   * Loads the whiteboard state
   * @param {string} projectId 
   */
  async loadState(projectId) {
    return this._initState(projectId);
  }

  /**
   * Handles creating a new object
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} payload 
   */
  async handleCreate(projectId, userId, payload) {
    const state = await this._initState(projectId);
    const { objectId, type } = payload;
    
    if (!objectId || !type) throw new ValidationError('objectId and type are required');
    
    const newObj = {
      ...payload,
      createdBy: userId,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false
    };

    state.objects.set(objectId, newObj);
    state.dirty = true;
    state.clock.tick();

    return { ...newObj, logicalTimestamp: state.clock.time };
  }

  /**
   * Handles updating an existing object
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} payload 
   */
  async handleUpdate(projectId, userId, payload) {
    const state = await this._initState(projectId);
    const { objectId, logicalTimestamp } = payload;

    if (!objectId) throw new ValidationError('objectId is required');
    const existingObj = state.objects.get(objectId);
    if (!existingObj) throw new ValidationError('Object not found');

    if (logicalTimestamp) state.clock.receive(logicalTimestamp);
    state.clock.tick();

    const updatedObj = {
      ...existingObj,
      ...payload,
      version: existingObj.version + 1,
      updatedAt: new Date(),
      style: { ...(existingObj.style || {}), ...(payload.style || {}) }
    };

    state.objects.set(objectId, updatedObj);
    state.dirty = true;

    return { ...updatedObj, logicalTimestamp: state.clock.time };
  }

  /**
   * Handles deleting an object
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} payload 
   */
  async handleDelete(projectId, userId, payload) {
    const state = await this._initState(projectId);
    const { objectId, logicalTimestamp } = payload;

    if (!objectId) throw new ValidationError('objectId is required');
    const existingObj = state.objects.get(objectId);
    if (!existingObj) return null;

    if (logicalTimestamp) state.clock.receive(logicalTimestamp);
    state.clock.tick();

    existingObj.deleted = true;
    existingObj.updatedAt = new Date();
    existingObj.version += 1;
    
    state.objects.set(objectId, existingObj);
    state.dirty = true;

    return { objectId, deleted: true, logicalTimestamp: state.clock.time };
  }

  /**
   * Handles clearing all objects on whiteboard
   * @param {string} projectId 
   * @param {string} userId 
   */
  async handleClear(projectId, userId) {
    const state = await this._initState(projectId);
    for (const [id, obj] of state.objects.entries()) {
      obj.deleted = true;
      obj.updatedAt = new Date();
      obj.version += 1;
      state.objects.set(id, obj);
    }
    state.dirty = true;
    state.clock.tick();
    await this.saveSnapshot(projectId);
    return { cleared: true, logicalTimestamp: state.clock.time };
  }

  /**
   * Handles cursor movement
   * @param {string} projectId 
   * @param {string} userId 
   * @param {object} payload 
   */
  async handleCursorMove(projectId, userId, payload) {
    const state = await this._initState(projectId);
    const { x, y } = payload;
    
    const currentCursor = state.cursors.get(userId);
    const now = Date.now();
    
    // Throttle cursor updates (50ms)
    if (currentCursor && (now - currentCursor.lastUpdate) < 50) {
      return null;
    }

    const cursorData = { x, y, lastUpdate: now };
    state.cursors.set(userId, cursorData);
    
    return cursorData;
  }

  /**
   * Gets active cursors
   * @param {string} projectId 
   */
  async getCursors(projectId) {
    const state = await this._initState(projectId);
    const now = Date.now();
    const activeCursors = {};
    
    for (const [userId, cursor] of state.cursors.entries()) {
      if (now - cursor.lastUpdate < 30000) { // 30s expiry
        activeCursors[userId] = cursor;
      } else {
        state.cursors.delete(userId);
      }
    }
    return activeCursors;
  }

  /**
   * Gets full state
   * @param {string} projectId 
   */
  async getState(projectId) {
    const state = await this._initState(projectId);
    const objects = Array.from(state.objects.values()).filter(obj => !obj.deleted);
    const cursors = await this.getCursors(projectId);
    return { objects, cursors, version: state.clock.time };
  }

  /**
   * Persists snapshot to MongoDB
   * @param {string} projectId 
   */
  async saveSnapshot(projectId) {
    const state = this.inMemoryState.get(projectId);
    if (!state || !state.dirty) return;

    try {
      const doc = await WhiteboardDocument.findOne({ projectId });
      if (doc) {
        doc.objects = Array.from(state.objects.values());
        doc.version += 1;
        await doc.save();
        state.dirty = false;
        state.lastSave = new Date();
        logger.info(`Saved whiteboard snapshot for project ${projectId}`);
      }
    } catch (error) {
      logger.error(`Error saving whiteboard snapshot for ${projectId}:`, error);
    }
  }

  async _periodicSave() {
    for (const [projectId, state] of this.inMemoryState.entries()) {
      if (state.dirty) {
        await this.saveSnapshot(projectId);
      }
    }
  }

  /**
   * Clean up memory when no connections remain
   * @param {string} projectId 
   */
  async cleanup(projectId) {
    await this.saveSnapshot(projectId);
    this.inMemoryState.delete(projectId);
  }
}

module.exports = new WhiteboardManager();
