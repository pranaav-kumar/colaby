const Snapshot = require('../models/Snapshot');
const CollaborationEvent = require('../models/CollaborationEvent');
const logger = require('../utils/logger');
// Ensure these utilities are available or implement them
const crypto = require('crypto');
const generateSnapshotId = () => crypto.randomUUID();
const generateEventId = () => crypto.randomUUID();

/**
 * Snapshot and recovery service
 */
class SnapshotService {
  constructor() {
    this.operationCounters = new Map(); // projectId:type -> count since last snapshot
    this.SNAPSHOT_THRESHOLD = 100; // operations
    this.SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Create a snapshot
   * @param {string} projectId 
   * @param {string} type 
   * @param {Object} state 
   * @param {number} version 
   * @param {Object} metadata 
   */
  async createSnapshot(projectId, type, state, version, metadata = {}) {
    try {
      const snapshotId = generateSnapshotId();
      const snapshot = new Snapshot({
        snapshotId,
        projectId,
        type,
        state,
        version,
        metadata
      });

      await snapshot.save();
      
      const key = `${projectId}:${type}`;
      this.operationCounters.set(key, 0); // Reset counter

      logger.info(`Snapshot created for project ${projectId} of type ${type} at version ${version}`);
      
      // Trigger cleanup
      await this.cleanupOldSnapshots(projectId, type);
      
      return snapshot;
    } catch (error) {
      logger.error(`Error creating snapshot for project ${projectId} type ${type}:`, error);
      throw error;
    }
  }

  /**
   * Get the latest snapshot for a project+type
   * @param {string} projectId 
   * @param {string} type 
   * @returns {Promise<Object|null>}
   */
  async getLatestSnapshot(projectId, type) {
    try {
      const snapshot = await Snapshot.findOne({ projectId, type })
        .sort({ version: -1 })
        .limit(1)
        .lean();
      return snapshot;
    } catch (error) {
      logger.error(`Error getting latest snapshot for project ${projectId} type ${type}:`, error);
      return null;
    }
  }

  /**
   * Get events since a specific logical timestamp
   * @param {string} projectId 
   * @param {number} logicalTimestamp 
   * @returns {Promise<Array>}
   */
  async getEventsSince(projectId, logicalTimestamp) {
    try {
      const events = await CollaborationEvent.find({
        projectId,
        logicalTimestamp: { $gt: logicalTimestamp }
      })
      .sort({ logicalTimestamp: 1 })
      .limit(1000) // Safety cap
      .lean();
      
      return events;
    } catch (error) {
      logger.error(`Error getting events since timestamp ${logicalTimestamp} for project ${projectId}:`, error);
      return [];
    }
  }

  /**
   * Persist a collaboration event
   * @param {Object} eventData 
   */
  async persistEvent(eventData) {
    try {
      const { projectId, userId, type, operationId, logicalTimestamp, payload } = eventData;
      
      const event = new CollaborationEvent({
        eventId: generateEventId(),
        projectId,
        userId,
        type,
        operationId,
        logicalTimestamp,
        payload
      });

      await event.save();
      
      // Update counter for auto-snapshotting based on broad type mapping
      let broadType = null;
      if (type.startsWith('WHITEBOARD_')) broadType = 'WHITEBOARD';
      else if (type.startsWith('FILE_')) broadType = 'FILE_TREE';
      else if (type.startsWith('CODE_')) broadType = 'CODE_DOCUMENT';

      if (broadType) {
        const key = `${projectId}:${broadType}`;
        const currentCount = (this.operationCounters.get(key) || 0) + 1;
        this.operationCounters.set(key, currentCount);
        
        // Note: auto-snapshot triggering might require fetching the actual state from a manager.
        // It's often better if managers check shouldAutoSnapshot and then call createSnapshot.
      }
      
      return event;
    } catch (error) {
      logger.error(`Error persisting event ${eventData.type} for project ${eventData.projectId}:`, error);
    }
  }

  /**
   * Recovery: get state for a reconnecting client
   * @param {string} projectId 
   * @param {string} type 
   * @param {number} lastKnownVersion 
   * @returns {Promise<Object>}
   */
  async getRecoveryState(projectId, type, lastKnownVersion = 0) {
    try {
      const snapshot = await this.getLatestSnapshot(projectId, type);
      
      let events = [];
      let currentVersion = lastKnownVersion;

      if (snapshot) {
        // If snapshot version is newer or equal to lastKnownVersion, we use the snapshot's timestamp as base
        // (Assuming snapshot version maps to logicalTimestamp in some way, or we fetch events since snapshot creation)
        currentVersion = Math.max(lastKnownVersion, snapshot.version);
        events = await this.getEventsSince(projectId, currentVersion);
      } else {
        events = await this.getEventsSince(projectId, lastKnownVersion);
      }
      
      return { snapshot, events, currentVersion };
    } catch (error) {
      logger.error(`Error getting recovery state for project ${projectId} type ${type}:`, error);
      return { snapshot: null, events: [], currentVersion: lastKnownVersion };
    }
  }

  /**
   * Check if auto-snapshot is needed
   * @param {string} projectId 
   * @param {string} type 
   * @returns {boolean}
   */
  shouldAutoSnapshot(projectId, type) {
    const key = `${projectId}:${type}`;
    const count = this.operationCounters.get(key) || 0;
    return count >= this.SNAPSHOT_THRESHOLD;
  }

  /**
   * Cleanup old snapshots (keep last 10 per project per type)
   * @param {string} projectId 
   * @param {string} type 
   */
  async cleanupOldSnapshots(projectId, type) {
    try {
      const snapshots = await Snapshot.find({ projectId, type })
        .sort({ version: -1 })
        .select('_id')
        .skip(10)
        .lean();
        
      if (snapshots.length > 0) {
        const idsToDelete = snapshots.map(s => s._id);
        await Snapshot.deleteMany({ _id: { $in: idsToDelete } });
        logger.info(`Cleaned up ${idsToDelete.length} old snapshots for project ${projectId} type ${type}`);
      }
    } catch (error) {
      logger.error(`Error cleaning up old snapshots for project ${projectId} type ${type}:`, error);
    }
  }
}

module.exports = new SnapshotService();
