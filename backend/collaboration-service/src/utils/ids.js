const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/** @returns {string} New event ID */
const generateEventId = () => uuidv4();
/** @returns {string} New message ID */
const generateMessageId = () => uuidv4();
/** @returns {string} New operation ID */
const generateOperationId = () => uuidv4();
/** @returns {string} New snapshot ID */
const generateSnapshotId = () => uuidv4();

/**
 * Generates a stable Tree-CRDT Node ID according to the formula:
 * IDn = hash(name + createdAt + userId)
 * @param {string} name 
 * @param {number|Date|string} createdAt 
 * @param {string} userId 
 * @returns {string}
 */
const generateNodeId = (name, createdAt = Date.now(), userId = 'system') => {
  const timeStr = typeof createdAt === 'object' ? createdAt.getTime() : String(createdAt);
  const raw = `${name}_${timeStr}_${userId}_${Math.random().toString(36).substring(2, 7)}`;
  return 'node_' + crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
};

/**
 * Generates a DETERMINISTIC node ID based solely on the relative path.
 * Always returns the same ID for the same file/folder path across restarts.
 * Used during disk-scan so that DB delete tombstones can match disk-scanned nodes.
 * @param {string} relativePath - e.g. "src/components/App.js"
 * @returns {string}
 */
const generateDeterministicNodeId = (relativePath) => {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return 'dnode_' + crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 20);
};

module.exports = {
  generateEventId,
  generateMessageId,
  generateOperationId,
  generateSnapshotId,
  generateNodeId,
  generateDeterministicNodeId
};

