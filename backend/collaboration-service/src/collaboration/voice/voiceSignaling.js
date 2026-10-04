const logger = require('../../utils/logger');

/**
 * Represents a voice session within a project
 */
class VoiceSession {
  /**
   * @param {string} projectId 
   */
  constructor(projectId) {
    this.projectId = projectId;
    this.participants = new Map(); // userId -> { userId, joinedAt, muted }
    this.maxParticipants = 8;
  }
}

/**
 * WebRTC signaling server for voice calls
 */
class VoiceSignaling {
  constructor() {
    // Map<projectId, VoiceSession>
    this.sessions = new Map();
  }

  /**
   * Add a user to a voice session
   * @param {string} projectId 
   * @param {string} userId 
   * @returns {Object|null} Result object or null if rejected
   */
  joinVoice(projectId, userId) {
    if (!this.sessions.has(projectId)) {
      this.sessions.set(projectId, new VoiceSession(projectId));
    }

    const session = this.sessions.get(projectId);

    if (session.participants.has(userId)) {
      // User already in session
      return {
        participants: Array.from(session.participants.values()),
        joined: userId
      };
    }

    if (session.participants.size >= session.maxParticipants) {
      logger.warn(`Voice session full for project ${projectId}`);
      return null; // Rejected
    }

    session.participants.set(userId, {
      userId,
      joinedAt: Date.now(),
      muted: false
    });

    logger.info(`User ${userId} joined voice session for project ${projectId}`);

    return {
      participants: Array.from(session.participants.values()),
      joined: userId
    };
  }

  /**
   * Remove user from a voice session
   * @param {string} projectId 
   * @param {string} userId 
   * @returns {Object|null} Result object or null if user wasn't in session
   */
  leaveVoice(projectId, userId) {
    const session = this.sessions.get(projectId);
    if (!session || !session.participants.has(userId)) {
      return null;
    }

    session.participants.delete(userId);
    logger.info(`User ${userId} left voice session for project ${projectId}`);

    if (session.participants.size === 0) {
      this.sessions.delete(projectId);
    }

    return {
      participants: session ? Array.from(session.participants.values()) : [],
      left: userId
    };
  }

  /**
   * Update participant mute/deafen/screen-sharing status
   * @param {string} projectId 
   * @param {string} userId 
   * @param {Object} state 
   */
  updateMuteState(projectId, userId, state) {
    const session = this.sessions.get(projectId);
    if (!session || !session.participants.has(userId)) return null;
    const participant = session.participants.get(userId);
    if (state.isMuted !== undefined) participant.muted = state.isMuted;
    if (state.isDeafened !== undefined) participant.deafened = state.isDeafened;
    if (state.isScreenSharing !== undefined) participant.screenSharing = state.isScreenSharing;
    return participant;
  }

  /**
   * Handle WebRTC Offer
   * @param {string} projectId 
   * @param {string} fromUserId 
   * @param {string} toUserId 
   * @param {Object} sdp 
   * @returns {Object|null} The offer to relay, or null if invalid
   */
  handleOffer(projectId, fromUserId, toUserId, sdp) {
    const session = this.sessions.get(projectId);
    if (!session || !session.participants.has(fromUserId) || !session.participants.has(toUserId)) {
      return null;
    }
    return { fromUserId, toUserId, sdp };
  }

  /**
   * Handle WebRTC Answer
   * @param {string} projectId 
   * @param {string} fromUserId 
   * @param {string} toUserId 
   * @param {Object} sdp 
   * @returns {Object|null} The answer to relay, or null if invalid
   */
  handleAnswer(projectId, fromUserId, toUserId, sdp) {
    const session = this.sessions.get(projectId);
    if (!session || !session.participants.has(fromUserId) || !session.participants.has(toUserId)) {
      return null;
    }
    return { fromUserId, toUserId, sdp };
  }

  /**
   * Handle ICE Candidate
   * @param {string} projectId 
   * @param {string} fromUserId 
   * @param {string} toUserId 
   * @param {Object} candidate 
   * @returns {Object|null} The candidate to relay, or null if invalid
   */
  handleIceCandidate(projectId, fromUserId, toUserId, candidate) {
    const session = this.sessions.get(projectId);
    if (!session || !session.participants.has(fromUserId) || !session.participants.has(toUserId)) {
      return null;
    }
    return { fromUserId, toUserId, candidate };
  }

  /**
   * Get session state
   * @param {string} projectId 
   * @returns {Array} List of participants
   */
  getSession(projectId) {
    const session = this.sessions.get(projectId);
    return session ? Array.from(session.participants.values()) : [];
  }

  /**
   * Check if user is in voice session
   * @param {string} projectId 
   * @param {string} userId 
   * @returns {boolean}
   */
  isInVoice(projectId, userId) {
    const session = this.sessions.get(projectId);
    return session ? session.participants.has(userId) : false;
  }

  /**
   * Remove user from all sessions (on disconnect)
   * @param {string} userId 
   * @returns {Array<string>} List of affected projectIds
   */
  removeUserFromAll(userId) {
    const affectedProjects = [];
    for (const [projectId, session] of this.sessions.entries()) {
      if (session.participants.has(userId)) {
        session.participants.delete(userId);
        affectedProjects.push(projectId);
        logger.info(`User ${userId} removed from voice session ${projectId} due to disconnect`);
        if (session.participants.size === 0) {
          this.sessions.delete(projectId);
        }
      }
    }
    return affectedProjects;
  }
}

module.exports = new VoiceSignaling();
