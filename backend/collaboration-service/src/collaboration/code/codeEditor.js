const Y = require('yjs');

class CollaborativeCodeEditor {
  constructor(projectId, filePath) {
    this.projectId = projectId;
    this.filePath = filePath;
    this.doc = new Y.Doc();
    this.text = this.doc.getText('monaco');
    this.awareness = new Map(); // userId -> state
    this.lastSaved = Date.now();
    this.dirty = false;
    this.revision = 0;
  }

  /**
   * Load initial content from string
   * @param {string} fileContent 
   */
  loadContent(fileContent) {
    this.doc.transact(() => {
      this.text.delete(0, this.text.length);
      this.text.insert(0, fileContent);
    });
    this.dirty = false;
  }

  /**
   * Apply remote update
   * @param {Buffer|Uint8Array} update 
   */
  applyUpdate(update) {
    Y.applyUpdate(this.doc, Buffer.from(update));
    this.dirty = true;
    this.revision += 1;
  }

  /**
   * Get full encoded state
   */
  getEncodedState() {
    return Buffer.from(Y.encodeStateAsUpdate(this.doc));
  }

  /**
   * Get state vector
   */
  getStateVector() {
    return Buffer.from(Y.encodeStateVector(this.doc));
  }

  /**
   * Get incremental update since vector
   * @param {Buffer|Uint8Array} stateVector 
   */
  getUpdateSince(stateVector) {
    return Buffer.from(Y.encodeStateAsUpdate(this.doc, stateVector));
  }

  /**
   * Get raw text content
   */
  getContent() {
    return this.text.toString();
  }

  /**
   * Update cursor for a user
   * @param {string} userId 
   * @param {object} cursorData 
   */
  updateCursor(userId, cursorData) {
    this.awareness.set(userId, { ...cursorData, lastUpdate: Date.now() });
  }

  /**
   * Remove a user's cursor
   * @param {string} userId 
   */
  removeCursor(userId) {
    this.awareness.delete(userId);
  }

  /**
   * Get all active cursors
   */
  getCursors() {
    return Object.fromEntries(this.awareness);
  }

  /**
   * Destroy the document
   */
  destroy() {
    this.doc.destroy();
    this.awareness.clear();
  }
}

module.exports = CollaborativeCodeEditor;
